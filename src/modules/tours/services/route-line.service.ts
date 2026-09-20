import { Injectable, Logger } from '@nestjs/common';
import { RoutingFacade } from '../../routing';
import { type PointRow } from '../stores/points.store';
import { type TourRow, ToursStore } from '../stores/tours.store';
import { type RouteLine } from '../tours.tables';

/** Valhalla answers in one request; more waypoints than this go in several. */
const WAYPOINTS_PER_REQUEST = 20;

@Injectable()
export class RouteLineService {
  private readonly logger = new Logger(RouteLineService.name);

  constructor(
    private readonly routing: RoutingFacade,
    private readonly tours: ToursStore,
  ) {}

  /**
   * The line the app draws between the tour's points. It follows streets and
   * footpaths, so it is built by the routing engine rather than stored with the
   * content. The result is cached on the tour and rebuilt as soon as the points
   * move, are reordered, added or removed.
   *
   * Routing being down is not a reason to fail the tour: the map then shows the
   * points without a line, and the next request tries again.
   */
  async forTour(tour: TourRow, points: PointRow[]): Promise<RouteLine | null> {
    const waypoints = points
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((point) => ({ lat: point.latitude, lon: point.longitude }));
    if (waypoints.length < 2) {
      return null;
    }

    const key = routeKey(waypoints);
    if (tour.route && tour.routeKey === key) {
      return tour.route;
    }

    try {
      const coordinates: [number, number][] = [];
      for (const leg of chunks(waypoints, WAYPOINTS_PER_REQUEST)) {
        const route = await this.routing.walkingRouteVia(leg);
        // Chunks overlap by one waypoint, so drop its repeated coordinate
        coordinates.push(...route.geometry.coordinates.slice(coordinates.length && 1));
      }
      const route: RouteLine = { type: 'LineString', coordinates };
      await this.tours.update(tour.id, { route, routeKey: key });
      return route;
    } catch (error) {
      this.logger.warn(`Could not build the route of tour ${tour.id}: ${String(error)}`);
      return null;
    }
  }
}

function routeKey(waypoints: { lat: number; lon: number }[]): string {
  return waypoints.map(({ lat, lon }) => `${lat},${lon}`).join(';');
}

/** Consecutive chunks sharing one waypoint, so the legs join without a gap. */
function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length - 1; start += size - 1) {
    result.push(items.slice(start, start + size));
  }
  return result;
}
