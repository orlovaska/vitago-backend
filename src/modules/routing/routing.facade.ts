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
}
