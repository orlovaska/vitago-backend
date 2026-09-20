import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../platform/config';
import { AppError } from '../../platform/http';
import { decodePolyline } from './polyline';

const REQUEST_TIMEOUT_MS = 10_000;

/** Valhalla answers one route in one request; more waypoints than this go in several. */
const WAYPOINTS_PER_REQUEST = 20;

/** Valhalla error codes: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/#http-status-codes-and-conditions */
const NO_EDGES_NEAR_LOCATION = new Set([170, 171]);
const NO_PATH = new Set([154, 442, 443]);

export interface Coordinates {
  lat: number;
  lon: number;
}

/** GeoJSON LineString, [longitude, latitude] pairs: the same shape as a tour's route. */
export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface WalkingRoute {
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteGeometry;
}

export interface RouterStatus {
  version: string;
  tilesetLastModified: number | null;
}

interface ValhallaRouteResponse {
  trip: {
    summary: { length: number; time: number };
    legs: { shape: string }[];
  };
}

interface ValhallaMatrixResponse {
  /** One row per source, one cell per target; `time` is null where no path exists. */
  sources_to_targets: { time: number | null; distance: number | null }[][];
}

interface ValhallaError {
  error_code?: number;
  error?: string;
}

interface ValhallaStatus {
  version: string;
  tileset_last_modified?: number;
}

/** Self-hosted Valhalla (deploy/routing). Walking routes only. */
@Injectable()
export class ValhallaClient {
  private readonly logger = new Logger(ValhallaClient.name);

  constructor(private readonly config: AppConfig) {}

  walkingRoute(from: Coordinates, to: Coordinates): Promise<WalkingRoute> {
    return this.walkingRouteVia([from, to]);
  }

  /** One walking route through every waypoint in order, as one line. */
  async walkingRouteVia(locations: Coordinates[]): Promise<WalkingRoute> {
    const response = await this.call<ValhallaRouteResponse>('/route', {
      locations,
      costing: 'pedestrian',
      units: 'kilometers',
      directions_type: 'none',
    });
    const { summary, legs } = response.trip;
    return {
      distanceMeters: Math.round(summary.length * 1000),
      durationSeconds: Math.round(summary.time),
      geometry: {
        type: 'LineString',
        // Legs join end to start, so each leg after the first repeats the previous last point.
        coordinates: legs.flatMap((leg, index) => decodePolyline(leg.shape).slice(index && 1)),
      },
    };
  }

  /**
   * The same route, but for any number of waypoints: they go to the engine in
   * chunks that share one waypoint, so the legs join without a gap. Chunks
   * overlap by a point, never by a leg, so their distances and times sum.
   */
  async walkingRouteThrough(waypoints: Coordinates[]): Promise<WalkingRoute> {
    if (waypoints.length < 2) {
      throw AppError.badRequest('routing_too_few_waypoints', 'A route needs at least two points');
    }
    const coordinates: [number, number][] = [];
    let distanceMeters = 0;
    let durationSeconds = 0;
    for (const chunk of chunks(waypoints, WAYPOINTS_PER_REQUEST)) {
      const leg = await this.walkingRouteVia(chunk);
      coordinates.push(...leg.geometry.coordinates.slice(coordinates.length && 1));
      distanceMeters += leg.distanceMeters;
      durationSeconds += leg.durationSeconds;
    }
    return { distanceMeters, durationSeconds, geometry: { type: 'LineString', coordinates } };
  }

  /**
   * Walking times in seconds between every pair of locations, `[from][to]`.
   * An unreachable pair is `Infinity`, so a caller comparing costs never picks it.
   */
  async walkingMatrix(locations: Coordinates[]): Promise<number[][]> {
    const response = await this.call<ValhallaMatrixResponse>('/sources_to_targets', {
      sources: locations,
      targets: locations,
      costing: 'pedestrian',
      units: 'kilometers',
    });
    return response.sources_to_targets.map((row) =>
      row.map((cell) => (cell.time === null ? Number.POSITIVE_INFINITY : cell.time)),
    );
  }

  async status(): Promise<RouterStatus> {
    const response = await this.call<ValhallaStatus>('/status');
    return {
      version: response.version,
      tilesetLastModified: response.tileset_last_modified ?? null,
    };
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const baseUrl = this.config.env.VALHALLA_URL;
    if (!baseUrl) throw unavailable('Routing is not configured');

    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      payload = await response.json();
    } catch (error) {
      this.logger.warn(`Valhalla ${path} failed: ${String(error)}`);
      throw unavailable('The routing engine is unreachable');
    }
    if (response.ok) return payload as T;

    const { error_code: code, error } = payload as ValhallaError;
    if (code !== undefined && NO_EDGES_NEAR_LOCATION.has(code)) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'routing_point_out_of_area',
        'A point is outside the area covered by routing',
      );
    }
    if (code !== undefined && NO_PATH.has(code)) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'routing_route_not_found',
        'No walking route connects these points',
      );
    }
    this.logger.warn(`Valhalla ${path} refused: ${response.status} ${code ?? ''} ${error ?? ''}`);
    throw unavailable('The routing engine refused the request');
  }
}

const unavailable = (detail: string) =>
  new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'routing_unavailable', detail);

/** Consecutive chunks sharing one waypoint, so the legs join without a gap. */
function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length - 1; start += size - 1) {
    result.push(items.slice(start, start + size));
  }
  return result;
}
