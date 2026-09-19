import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const settingsSchema = pgSchema('settings');

/**
 * Overrides of settings declared in settings.catalog.ts. A missing row means
 * the catalog default applies; keys outside the catalog are never written.
 */
export const settings = settingsSchema.table('settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** Admin who made the change. */
  updatedBy: uuid(),
});
