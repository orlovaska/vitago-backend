import { z } from 'zod';
import { createZodDto } from '../../../platform/http';
import {
  categoryInputSchema,
  mapViewportSchema,
  pointAudioInputSchema,
  pointInputSchema,
  routeSchema,
  tourInputSchema,
} from '../tours.inputs';
import { tourStatus } from '../tours.tables';

// ---- Mobile app ----

const tourCardSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  /** Short text for the tour card. */
  summary: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  /** 0 for a free tour. */
  priceKopecks: z.number().int(),
  distanceMeters: z.number().int().nullable(),
  durationMinutes: z.number().int().nullable(),
  pointCount: z.number().int(),
});

export class TourCardListDto extends createZodDto(z.object({ items: z.array(tourCardSchema) })) {}

const subtitleSchema = z.object({ startMs: z.number(), endMs: z.number(), text: z.string() });

const pointContentSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  latitude: z.number(),
  longitude: z.number(),
  isFree: z.boolean(),
  name: z.string(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  openingHours: z.string().nullable(),
  imageUrl: z.string().nullable(),
  markerImageUrl: z.string().nullable(),
  lockedMarkerImageUrl: z.string().nullable(),
  categoryIds: z.array(z.uuid()),
  audio: z
    .object({
      url: z.string().nullable(),
      autoplayRadiusMeters: z.number().int(),
      durationSeconds: z.number().int().nullable(),
      transcript: z.string().nullable(),
      subtitles: z.array(subtitleSchema).nullable(),
    })
    .nullable(),
});

const localizedCategorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  iconImageUrl: z.string().nullable(),
});

export class TourContentDto extends createZodDto(
  tourCardSchema.extend({
    description: z.string().nullable(),
    introAudioUrl: z.string().nullable(),
    imageUrls: z.array(z.string()),
    mapViewport: mapViewportSchema.nullable(),
    route: routeSchema.nullable(),
    points: z.array(pointContentSchema),
    categories: z.array(localizedCategorySchema),
  }),
) {}

export class CategoryListDto extends createZodDto(
  z.object({ items: z.array(localizedCategorySchema) }),
) {}

export class TourRefParamDto extends createZodDto(
  z.object({ idOrSlug: z.string().min(1).max(100) }),
) {}

// ---- Admin ----

export class TourInputDto extends createZodDto(tourInputSchema) {}
export class PointInputDto extends createZodDto(pointInputSchema) {}
export class PointAudioInputDto extends createZodDto(pointAudioInputSchema) {}
export class CategoryInputDto extends createZodDto(categoryInputSchema) {}

export class ListToursQueryDto extends createZodDto(z.object({ appId: z.uuid() })) {}

export class AdminTourListDto extends createZodDto(
  z.object({
    items: z.array(
      z.object({
        id: z.uuid(),
        slug: z.string(),
        status: z.enum(tourStatus.enumValues),
        position: z.number().int(),
        priceKopecks: z.number().int(),
        updatedAt: z.iso.datetime(),
      }),
    ),
  }),
) {}

export class TourEditorDto extends createZodDto(
  tourInputSchema.extend({
    id: z.uuid(),
    publishedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    points: z.array(
      z.object({
        id: z.uuid(),
        position: z.number().int(),
        name: z.string(),
        hasAudio: z.boolean(),
      }),
    ),
  }),
) {}

export class PointEditorDto extends createZodDto(
  pointInputSchema.extend({
    id: z.uuid(),
    tourId: z.uuid(),
    position: z.number().int(),
  }),
) {}

export class ReorderPointsDto extends createZodDto(
  z.object({ pointIds: z.array(z.uuid()).max(1000) }),
) {}

export class AdminCategoryListDto extends createZodDto(
  z.object({
    items: z.array(
      categoryInputSchema.extend({
        id: z.uuid(),
      }),
    ),
  }),
) {}

export class AdminCategoryDto extends createZodDto(categoryInputSchema.extend({ id: z.uuid() })) {}
