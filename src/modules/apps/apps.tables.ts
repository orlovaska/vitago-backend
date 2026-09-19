import {
  boolean,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from '../../platform/database';

export const appsSchema = pgSchema('apps');

/** Where a build of the app is distributed. */
export const store = appsSchema.enum('store', ['app_store', 'google_play', 'rustore']);

/** One row per city app published in the stores. */
export const apps = appsSchema.table('apps', {
  id: primaryId(),
  slug: text().notNull().unique(),
  bundleId: text().notNull().unique(),
  name: text().notNull(),
  /** Custom URL scheme the app registers, e.g. `vitago-spb`, used for returns from the browser. */
  urlScheme: text(),
  /** MapLibre style the app loads; swappable here without a release. */
  mapStyleUrl: text(),
  /** Stores whose builds may sell tours; the others show content without payment. */
  paymentStores: store().array().notNull().default([]),
  /** Ask for an e-mail before payment so the bank can send the receipt. */
  receiptEmailRequired: boolean().notNull().default(false),
  supportEmail: text(),
  supportTelegramUrl: text(),
  supportVkUrl: text(),
  supportMaxUrl: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const appVersions = appsSchema.table(
  'app_versions',
  {
    id: primaryId(),
    appId: uuid()
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    store: store().notNull(),
    /** Semantic version, e.g. `1.4.2`. */
    version: text().notNull(),
    /** Clients older than a mandatory version must update before continuing. */
    mandatory: boolean().notNull().default(false),
    releaseNotes: text(),
    releasedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.appId, table.store, table.version)],
);

/** The version each user last reported for each app, to see who runs outdated builds. */
export const userAppVersions = appsSchema.table(
  'user_app_versions',
  {
    userId: uuid().notNull(),
    appId: uuid()
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    store: store().notNull(),
    version: text().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.appId] }), index().on(table.userId)],
);
