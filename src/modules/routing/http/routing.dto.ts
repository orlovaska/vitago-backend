import { z } from 'zod';
import { createZodDto } from '../../../platform/http';

const coordinates = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export class RouteRequestDto extends createZodDto(
  z.object({ from: coordinates, to: coordinates }),
) {}

export class WalkingRouteDto extends createZodDto(
  z.object({
    distanceMeters: z.number().int(),
    durationSeconds: z.number().int(),
    /** GeoJSON LineString, [longitude, latitude] pairs, like a tour's route. */
    geometry: z.object({
      type: z.literal('LineString'),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
  }),
) {}

export class RoutingStatusDto extends createZodDto(
  z.object({
    version: z.string(),
    /** Unix time of the graph build, when Valhalla reports it. */
    tilesetLastModified: z.number().int().nullable(),
    /** App slugs whose areas are configured in ROUTING_REGIONS. */
    regions: z.array(z.string()),
  }),
) {}
