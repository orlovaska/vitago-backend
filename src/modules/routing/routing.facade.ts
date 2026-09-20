import { Injectable } from '@nestjs/common';
import { type Coordinates, ValhallaClient, type WalkingRoute } from './valhalla.client';

/** What other modules may ask of `routing`. */
@Injectable()
export class RoutingFacade {
  constructor(private readonly valhalla: ValhallaClient) {}

  /**
   * The walking route between two points along streets and footpaths. Throws
   * `routing_point_out_of_area`, `routing_route_not_found` or `routing_unavailable`.
   */
  walkingRoute(from: Coordinates, to: Coordinates): Promise<WalkingRoute> {
    return this.valhalla.walkingRoute(from, to);
  }

  /**
   * The walking route through every waypoint in order, in one request. Use
   * `walkingRouteThrough` unless the caller knows the list is short.
   * Throws the same errors as `walkingRoute`.
   */
  walkingRouteVia(waypoints: Coordinates[]): Promise<WalkingRoute> {
    return this.valhalla.walkingRouteVia(waypoints);
  }

  /**
   * The walking route through every waypoint in order — the line a tour or a
   * generated walk draws on the map. Any number of waypoints; distance and
   * duration cover the whole way. Throws the same errors as `walkingRoute`.
   */
  walkingRouteThrough(waypoints: Coordinates[]): Promise<WalkingRoute> {
    return this.valhalla.walkingRouteThrough(waypoints);
  }

  /**
   * Walking times in seconds between every pair of locations, `[from][to]`;
   * an unreachable pair is `Infinity`. One request, so the caller can compare
   * many candidate orders without a route request each. Throws the same
   * errors as `walkingRoute`.
   */
  walkingMatrix(locations: Coordinates[]): Promise<number[][]> {
    return this.valhalla.walkingMatrix(locations);
  }
}
