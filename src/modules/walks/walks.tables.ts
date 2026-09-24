import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../../platform/database';
import { type RouteGeometry } from '../routing';
import { type Polygon } from '../../platform/geo';

export const walksSchema = pgSchema('walks');

/**
 * `active` — just generated, kept only until it expires; `saved` — the user
 * kept it; `purchased` — the user paid to unlock its points. The last two
 * never expire.
 */
export const walkStatus = walksSchema.enum('walk_status', ['active', 'saved', 'purchased']);

export const walkEndMode = walksSchema.enum('walk_end_mode', ['same_as_start', 'custom']);

/**
 * A walk the user generated from the app's points. Point ids come from the
 * tours module and the owner from auth; no foreign keys across schemas.
 */
export const walks = walksSchema.table(
  'walks',
  {
    id: primaryId(),
    userId: uuid().notNull(),
    appId: uuid().notNull(),
    /** What the user asked for, in minutes; the answer may differ slightly. */
    requestedMinutes: integer().notNull(),
    startLat: doublePrecision().notNull(),
    startLon: doublePrecision().notNull(),
    endMode: walkEndMode().notNull(),
    /** Set only when the walk ends somewhere other than its start. */
    endLat: doublePrecision(),
    endLon: doublePrecision(),
    /** Null means every category was allowed. */
    categoryIds: jsonb().$type<string[]>(),
    /** The area the user drew, if the walk was built inside one. */
    area: jsonb().$type<Polygon>(),
    /** The chosen points, in walking order. */
    pointIds: jsonb().$type<string[]>().notNull(),
    /** Cached walking line; rebuilt when routeKey stops matching the live points. */
    route: jsonb().$type<RouteGeometry>(),
    routeKey: text(),
    distanceMeters: integer().notNull(),
    /** Time on the move, from the routing engine. */
    walkingSeconds: integer().notNull(),
    /** Time at the points: narration plus a fixed overhead each. */
    visitSeconds: integer().notNull(),
    status: walkStatus().notNull().default('active'),
    /** When an `active` walk is deleted; null once it is saved or paid for. */
    expiresAt: timestamp({ withTimezone: true }),
    /**
     * When the user kept the walk. The list of kept walks is ordered by it:
     * a walk built yesterday and saved today belongs at the top.
     */
    savedAt: timestamp({ withTimezone: true }),
    /** Points the user could not listen to when the walk was generated. */
    lockedCount: integer().notNull().default(0),
    /** Price of unlocking, fixed at generation. */
    amountKopecks: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.userId, table.createdAt), index().on(table.status, table.expiresAt)],
);
