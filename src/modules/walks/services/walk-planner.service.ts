import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http';
import { type Locale } from '../../../platform/i18n';
import { type Coordinates, type RouteGeometry, RoutingFacade } from '../../routing';
import { SettingsFacade } from '../../settings';
import { ToursFacade, type WalkCandidate } from '../../tours';
import { haversineMeters, type LatLon, pointInPolygon, type Polygon, polygonBbox } from '../geo';
import { minimumBudgetSeconds, selectPoints, worstPoint } from './walk-selection';

export interface PlanRequest {
  appId: string;
  locale: Locale;
  durationMinutes: number;
  start: LatLon;
  /** Null when the walk comes back to where it started. */
  end: LatLon | null;
  /** Undefined means every category. */
  categoryIds?: readonly string[];
  /** The area the user drew; points outside it are never used. */
  area?: Polygon;
}

export interface PlannedWalk {
  /** The chosen points, in walking order. */
  pointIds: string[];
  route: RouteGeometry;
  distanceMeters: number;
  /** Time on the move, as the routing engine measured the final line. */
  walkingSeconds: number;
  /** Time spent at the points. */
  visitSeconds: number;
}

/** How many times a walk that came out too long may drop a point and try again. */
const MAX_TRIMS = 3;

const METERS_PER_LATITUDE_DEGREE = 111_320;

/**
 * Builds a walk out of the points of an app: which ones, in what order, and
 * the line between them. The time always comes from the routing engine —
 * nothing here guesses how fast the user walks.
 */
@Injectable()
export class WalkPlannerService {
  constructor(
    private readonly tours: ToursFacade,
    private readonly routing: RoutingFacade,
    private readonly settings: SettingsFacade,
  ) {}

  async plan(request: PlanRequest): Promise<PlannedWalk> {
    const budgetSeconds = request.durationMinutes * 60;
    const end = request.end ?? request.start;
    const [
      defaultVisitSeconds,
      pointOverheadSeconds,
      candidateSpeedMps,
      maxCandidates,
      maxPasses,
      budgetTolerance,
    ] = await Promise.all([
      this.settings.get('walks.defaultVisitSeconds'),
      this.settings.get('walks.pointOverheadSeconds'),
      this.settings.get('walks.candidateSpeedMps'),
      this.settings.get('walks.maxCandidates'),
      this.settings.get('walks.maxPasses'),
      this.settings.get('walks.budgetTolerance'),
    ]);

    const candidates = await this.candidates(request, {
      budgetSeconds,
      candidateSpeedMps,
      maxCandidates,
      end,
    });
    if (candidates.length === 0) throw noPoints();

    const visitSecondsOf = (candidate: WalkCandidate) =>
      (candidate.audioSeconds ?? defaultVisitSeconds) + pointOverheadSeconds;

    // Index 0 is the start, then the candidates; the end comes last, or is the
    // start itself when the walk is a loop.
    const locations: Coordinates[] = [
      { lat: request.start.lat, lon: request.start.lon },
      ...candidates.map((point) => ({ lat: point.latitude, lon: point.longitude })),
    ];
    const endIndex = request.end ? locations.push({ lat: end.lat, lon: end.lon }) - 1 : 0;
    const matrix = await this.routing.walkingMatrix(locations);
    const selectionInput = {
      matrix,
      startIndex: 0,
      endIndex,
      candidates: candidates.map((point, position) => ({
        index: position + 1,
        visitSeconds: visitSecondsOf(point),
      })),
      maxPasses,
    };

    const selection = selectPoints({ ...selectionInput, budgetSeconds });
    if (selection.order.length === 0) {
      throw this.tooShort(minimumBudgetSeconds(selectionInput), request.durationMinutes);
    }

    // The matrix holds estimates between pairs, but what the user really walks
    // is the line drawn through the chosen points. The budget is checked
    // against that line, and a point goes if it does not hold.
    const visitOf = new Map(selectionInput.candidates.map((c) => [c.index, c.visitSeconds]));
    let order = selection.order;
    for (let trim = 0; ; trim++) {
      const chosen = order.map((index) => candidates[index - 1]!);
      const visitSeconds = order.reduce((total, index) => total + (visitOf.get(index) ?? 0), 0);
      const route = await this.routing.walkingRouteThrough([
        { lat: request.start.lat, lon: request.start.lon },
        ...chosen.map((point) => ({ lat: point.latitude, lon: point.longitude })),
        { lat: end.lat, lon: end.lon },
      ]);
      const fits = route.durationSeconds + visitSeconds <= budgetSeconds * (1 + budgetTolerance);
      if (fits || order.length === 1 || trim >= MAX_TRIMS) {
        return {
          pointIds: chosen.map((point) => point.id),
          route: route.geometry,
          distanceMeters: route.distanceMeters,
          walkingSeconds: route.durationSeconds,
          visitSeconds,
        };
      }
      const worst = worstPoint(matrix, 0, endIndex, order, visitOf);
      order = order.filter((index) => index !== worst);
    }
  }

  /**
   * The points a walk may be built from: inside the area when one was drawn,
   * within reach of the time budget otherwise, and only as many of them as the
   * routing engine takes in one matrix.
   */
  private async candidates(
    request: PlanRequest,
    limits: {
      budgetSeconds: number;
      candidateSpeedMps: number;
      maxCandidates: number;
      end: LatLon;
    },
  ): Promise<WalkCandidate[]> {
    const area = request.area;
    const bbox = area
      ? polygonBbox(area)
      : reachBox(request.start, limits.end, (limits.budgetSeconds * limits.candidateSpeedMps) / 2);

    const found = await this.tours.pointCandidates(request.appId, request.locale, {
      bbox,
      categoryIds: request.categoryIds,
    });
    // The rectangle was only a cheap pre-filter: the drawn area decides.
    const inside = area
      ? found.filter((point) => pointInPolygon({ lat: point.latitude, lon: point.longitude }, area))
      : found;

    // Nearest to the way from the start to the end first: those are the ones a
    // walk can afford, and the matrix has room for only so many.
    return inside
      .map((point) => ({
        point,
        detour:
          haversineMeters(request.start, { lat: point.latitude, lon: point.longitude }) +
          haversineMeters({ lat: point.latitude, lon: point.longitude }, limits.end),
      }))
      .sort((a, b) => a.detour - b.detour || (a.point.id < b.point.id ? -1 : 1))
      .slice(0, limits.maxCandidates)
      .map(({ point }) => point);
  }

  /**
   * Nothing fits in the requested time. The app can offer a longer walk, but
   * only when the number is worth offering: twice the request is already a
   * different plan for the day.
   */
  private tooShort(minimumSeconds: number | null, requestedMinutes: number): AppError {
    if (minimumSeconds === null) return noPoints();
    const minimumMinutes = Math.ceil(minimumSeconds / 60);
    if (minimumMinutes > requestedMinutes * 2) return noPoints();
    return new AppError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'walk_budget_too_small',
      'No point can be reached in the requested time',
      { minimumMinutes },
    );
  }
}

const noPoints = () =>
  new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'walk_no_points_in_area',
    'There are no points to build a walk from here',
  );

/** A rectangle holding everything a walk of this budget could reach. */
function reachBox(start: LatLon, end: LatLon, reachMeters: number) {
  const latitudeSpan = reachMeters / METERS_PER_LATITUDE_DEGREE;
  const middleLatitude = (start.lat + end.lat) / 2;
  const longitudeSpan =
    reachMeters /
    (METERS_PER_LATITUDE_DEGREE * Math.max(Math.cos((middleLatitude * Math.PI) / 180), 0.01));
  return {
    minLat: Math.min(start.lat, end.lat) - latitudeSpan,
    maxLat: Math.max(start.lat, end.lat) + latitudeSpan,
    minLon: Math.min(start.lon, end.lon) - longitudeSpan,
    maxLon: Math.max(start.lon, end.lon) + longitudeSpan,
  };
}
