import { boolean, index, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../../platform/database';

export const authSchema = pgSchema('auth');

/**
 * How a user proves who they are. Only `device` exists today; VK ID or
 * Yandex ID would be new values here plus a new AuthProvider implementation.
 */
export const identityProvider = authSchema.enum('identity_provider', ['device']);

export const users = authSchema.table('users', {
  id: primaryId(),
  /** Short code the user reads out to support; never used for authentication. */
  supportCode: text().notNull().unique(),
  createdAt: createdAt(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const userIdentities = authSchema.table(
  'user_identities',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProvider().notNull(),
    /** Provider-side identifier; for `device` it is an HMAC of the device secret. */
    subject: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.provider, table.subject),
    // One identity per provider: a user has exactly one device for now.
    unique().on(table.userId, table.provider),
  ],
);

export const admins = authSchema.table('admins', {
  id: primaryId(),
  login: text().notNull().unique(),
  passwordHash: text().notNull(),
  createdAt: createdAt(),
  disabledAt: timestamp({ withTimezone: true }),
});

/** Kept in the database so a lockout survives restarts. */
export const adminLoginAttempts = authSchema.table(
  'admin_login_attempts',
  {
    id: primaryId(),
    login: text().notNull(),
    ip: text(),
    succeeded: boolean().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.login, table.createdAt)],
);
