import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../platform/config';
import { AppError } from '../../platform/http';
import { decodePolyline } from './polyline';

const REQUEST_TIMEOUT_MS = 10_000;

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
