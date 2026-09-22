import { z } from 'zod';

/**
 * Format of content/<city>/manifest.json: an app with its categories, tours
 * and points. File fields are paths relative to the manifest; the importer
 * uploads them and replaces them with media ids.
 */

const locale = z.enum(['ru', 'en']);
const file = z.string().min(1);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const pointSchema = z.object({
  latitude,
  longitude,
  isFree: z.boolean().default(false),
  image: file.optional(),
  /** Extra photos for the carousel on the point page, in display order. */
  images: z.array(file).default([]),
  marker: file.optional(),
  lockedMarker: file.optional(),
  /** Category slugs. */
  categories: z.array(z.string()).default([]),
  translations: z.array(
    z.object({
      locale,
      name: z.string(),
      description: z.string().optional(),
      address: z.string().optional(),
    }),
  ),
  audio: z
    .object({
      autoplayRadiusMeters: z.number().int().optional(),
      translations: z.array(
        z.object({
          locale,
          file,
          transcript: z.string().optional(),
          subtitles: z
            .array(z.object({ startMs: z.number(), endMs: z.number(), text: z.string() }))
            .optional(),
        }),
      ),
    })
    .optional(),
});

const tourSchema = z.object({
  slug: z.string(),
  status: z.enum(['draft', 'published']).default('published'),
  priceKopecks: z.number().int().min(0),
  position: z.number().int().default(0),
  distanceMeters: z.number().int().optional(),
  durationMinutes: z.number().int().optional(),
  mapViewport: z
    .object({
      center: z.object({ latitude, longitude }),
      zoom: z.number(),
      bounds: z
        .object({ south: latitude, west: longitude, north: latitude, east: longitude })
        .optional(),
    })
    .optional(),
  cover: file.optional(),
  images: z.array(file).default([]),
  translations: z.array(
    z.object({
      locale,
      title: z.string(),
      subtitle: z.string().optional(),
      summary: z.string().optional(),
      description: z.string().optional(),
      introAudio: file.optional(),
    }),
  ),
  points: z.array(pointSchema),
});

export const contentManifestSchema = z.object({
  app: z.object({
    slug: z.string(),
    bundleId: z.string(),
    name: z.string(),
    urlScheme: z.string().optional(),
    mapStyleUrl: z.url().optional(),
    mapSatelliteStyleUrl: z.url().optional(),
    mapHybridStyleUrl: z.url().optional(),
    /** Центр города: сюда встаёт карта и отсюда начинается прогулка без геолокации. */
    centerLat: z.number().min(-90).max(90).optional(),
    centerLon: z.number().min(-180).max(180).optional(),
    centerZoom: z.number().int().min(1).max(20).optional(),
    paymentStores: z.array(z.enum(['app_store', 'google_play', 'rustore'])).optional(),
  }),
  categories: z
    .array(
      z.object({
        slug: z.string(),
        position: z.number().int().default(0),
        translations: z.array(z.object({ locale, name: z.string() })),
      }),
    )
    .default([]),
  /**
   * Terms of use and privacy policy. Each entry publishes its PDF as the
   * current version; publicUrl is the web page the app links to when there
   * is one, and without it the app opens the PDF itself.
   */
  legal: z
    .array(
      z.object({
        type: z.enum(['terms', 'privacy']),
        file,
        publicUrl: z.url().optional(),
        /** True when the change is substantial enough to ask for consent again. */
        requiresReconsent: z.boolean().default(false),
      }),
    )
    .default([]),
  tours: z.array(tourSchema),
});

export type ContentManifest = z.infer<typeof contentManifestSchema>;
export type ManifestTour = z.infer<typeof tourSchema>;
export type ManifestPoint = z.infer<typeof pointSchema>;
