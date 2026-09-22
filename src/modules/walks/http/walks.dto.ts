import { z } from 'zod';
import { createZodDto } from '../../../platform/http';
import { walkEndMode, walkStatus } from '../walks.tables';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const placeSchema = z.object({ lat: latitude, lon: longitude });

/** GeoJSON position: longitude first, as the standard says. */
const positionSchema = z.tuple([longitude, latitude]);

/**
 * The area the user drew with a finger, already simplified and closed by the
 * app. One outer ring, and few enough corners that the ring is a shape rather
 * than a recording of every pixel the finger touched.
 */
const polygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(positionSchema).min(4).max(200)).length(1),
  })
  .refine((polygon) => {
    const ring = polygon.coordinates[0]!;
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    return first[0] === last[0] && first[1] === last[1];
  }, 'The ring must be closed: its first and last positions have to be the same');

/**
 * Either every category, or the ones the user picked. An empty list is
 * refused: nothing selected is not the same as everything selected, and the
 * app must say which it means.
 */
const categoriesSchema = z.union([z.literal('all'), z.array(z.uuid()).min(1).max(50)]);

export class GenerateWalkDto extends createZodDto(
  z
    .object({
      durationMinutes: z.number().int().min(15).max(600),
      start: placeSchema,
      endMode: z.enum(walkEndMode.enumValues).default('same_as_start'),
      /** Required when the walk ends somewhere other than its start. */
      end: placeSchema.nullish(),
      categories: categoriesSchema.default('all'),
      area: polygonSchema.nullish(),
    })
    .refine(
      (body) => body.endMode !== 'custom' || !!body.end,
      'A walk that ends elsewhere needs the place it ends at',
    ),
) {}

const subtitleSchema = z.object({ startMs: z.number(), endMs: z.number(), text: z.string() });

/** A point of a walk: the same content a tour shows, plus where it came from. */
const walkPointSchema = z.object({
  id: z.uuid(),
  /** The tour this point belongs to; a walk mixes points from several. */
  tourId: z.uuid(),
  /** Place in this walk, from 0 — not the position the point holds in its tour. */
  position: z.number().int(),
  latitude: z.number(),
  longitude: z.number(),
  isFree: z.boolean(),
  /** Whether this user may listen to it: free, tour bought, or walk unlocked. */
  accessible: z.boolean(),
  name: z.string(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  openingHours: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Carousel of the point page; the cover above is not repeated in it. */
  imageUrls: z.array(z.string()),
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

const walkSchema = z.object({
  id: z.uuid(),
  status: z.enum(walkStatus.enumValues),
  /** When an unsaved walk disappears; null once it is kept or paid for. */
  expiresAt: z.iso.datetime().nullable(),
  requestedMinutes: z.number().int(),
  start: placeSchema,
  endMode: z.enum(walkEndMode.enumValues),
  end: placeSchema.nullable(),
  categories: categoriesSchema,
  area: polygonSchema.nullable(),
  points: z.array(walkPointSchema),
  route: z
    .object({ type: z.literal('LineString'), coordinates: z.array(positionSchema) })
    .nullable(),
  mapViewport: z
    .object({
      center: z.object({ latitude: z.number(), longitude: z.number() }),
      zoom: z.number(),
      bounds: z.object({
        south: z.number(),
        west: z.number(),
        north: z.number(),
        east: z.number(),
      }),
    })
    .nullable(),
  distanceMeters: z.number().int(),
  walkingSeconds: z.number().int(),
  visitSeconds: z.number().int(),
  /** Walking and visiting together. */
  totalSeconds: z.number().int(),
  /** Missing when nothing is locked: then there is nothing to buy. */
  walkUnlock: z
    .object({ lockedCount: z.number().int(), amountKopecks: z.number().int() })
    .optional(),
});

export class WalkDto extends createZodDto(walkSchema) {}
export class WalkListDto extends createZodDto(z.object({ items: z.array(walkSchema) })) {}

export class WalkPointParamDto extends createZodDto(
  z.object({ id: z.uuid(), pointId: z.uuid() }),
) {}

export class UnlockWalkDto extends createZodDto(
  z.object({
    /** Store of the calling build; only stores enabled for the app may sell. */
    store: z.enum(['app_store', 'google_play', 'rustore']),
    /** Receipt e-mail; required when the app asks for it. */
    email: z.email().max(200).optional(),
  }),
) {}

export class WalkCheckoutDto extends createZodDto(
  z.object({
    orderId: z.uuid(),
    status: z.enum(['pending', 'paid', 'failed', 'expired', 'refunded']),
    /** Open in the browser to pay. */
    paymentUrl: z.string().nullable(),
    amountKopecks: z.number().int(),
    pollIntervalMs: z.number().int(),
    pollWindowMs: z.number().int(),
  }),
) {}
