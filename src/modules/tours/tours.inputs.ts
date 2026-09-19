import { z } from 'zod';
import { localeSchema } from '../../platform/i18n';
import { tourStatus } from './tours.tables';

/**
 * Write models of the tours module, shared by the admin API and the content
 * import so both validate content the same way.
 */

const fileId = z.uuid();
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/** Every language may appear once. */
const uniqueLocales = <T extends { locale: string }>(items: T[]) =>
  new Set(items.map((item) => item.locale)).size === items.length;

export const mapViewportSchema = z.object({
  center: z.object({ latitude, longitude }),
  zoom: z.number().min(0).max(22),
  bounds: z
    .object({ south: latitude, west: longitude, north: latitude, east: longitude })
    .optional(),
});

export const routeSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([longitude, latitude])).min(2),
});

export const tourTranslationSchema = z.object({
  locale: localeSchema,
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullable().default(null),
  summary: z.string().max(1000).nullable().default(null),
  description: z.string().max(20_000).nullable().default(null),
  introAudioId: fileId.nullable().default(null),
});

export const tourInputSchema = z.object({
  appId: z.uuid(),
  slug: z.string().regex(/^[a-z0-9-]{2,64}$/, 'Lowercase letters, digits and dashes'),
  status: z.enum(tourStatus.enumValues).default('draft'),
  priceKopecks: z.number().int().min(0).max(100_000_000).default(0),
  position: z.number().int().min(0).default(0),
  coverImageId: fileId.nullable().default(null),
  distanceMeters: z.number().int().min(0).nullable().default(null),
  durationMinutes: z.number().int().min(0).nullable().default(null),
  mapViewport: mapViewportSchema.nullable().default(null),
  route: routeSchema.nullable().default(null),
  translations: z
    .array(tourTranslationSchema)
    .min(1)
    .refine(uniqueLocales, 'Each language may appear once'),
  /** Carousel photos in display order. */
  imageIds: z.array(fileId).max(50).default([]),
});
export type TourInput = z.infer<typeof tourInputSchema>;

export const subtitleCueSchema = z
  .object({
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    text: z.string().max(1000),
  })
  .refine((cue) => cue.endMs >= cue.startMs, 'endMs must not precede startMs');

export const pointAudioInputSchema = z.object({
  autoplayRadiusMeters: z.number().int().min(5).max(1000).default(40),
  translations: z
    .array(
      z.object({
        locale: localeSchema,
        audioFileId: fileId,
        durationSeconds: z.number().int().min(0).nullable().default(null),
        transcript: z.string().max(50_000).nullable().default(null),
        subtitles: z.array(subtitleCueSchema).max(20_000).nullable().default(null),
      }),
    )
    .min(1)
    .refine(uniqueLocales, 'Each language may appear once'),
});
export type PointAudioInput = z.infer<typeof pointAudioInputSchema>;

export const pointInputSchema = z.object({
  latitude,
  longitude,
  isFree: z.boolean().default(false),
  imageId: fileId.nullable().default(null),
  markerImageId: fileId.nullable().default(null),
  lockedMarkerImageId: fileId.nullable().default(null),
  translations: z
    .array(
      z.object({
        locale: localeSchema,
        name: z.string().min(1).max(200),
        description: z.string().max(20_000).nullable().default(null),
        address: z.string().max(500).nullable().default(null),
        openingHours: z.string().max(500).nullable().default(null),
      }),
    )
    .min(1)
    .refine(uniqueLocales, 'Each language may appear once'),
  categoryIds: z.array(z.uuid()).max(20).default([]),
  /** Omit or null for a point without narration. */
  audio: pointAudioInputSchema.nullable().default(null),
});
export type PointInput = z.infer<typeof pointInputSchema>;

export const categoryInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  position: z.number().int().min(0).default(0),
  iconImageId: fileId.nullable().default(null),
  translations: z
    .array(z.object({ locale: localeSchema, name: z.string().min(1).max(100) }))
    .min(1)
    .refine(uniqueLocales, 'Each language may appear once'),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
