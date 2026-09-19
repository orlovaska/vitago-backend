import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { userIdentities, users } from './auth.tables';
import { type IdentityProviderName } from './providers/auth-provider';

export type UserRow = typeof users.$inferSelect;

/** Unambiguous characters: no 0/O or 1/I, so a code read over the phone survives. */
const SUPPORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUPPORT_CODE_LENGTH = 8;

export function generateSupportCode(): string {
  let code = '';
  for (let i = 0; i < SUPPORT_CODE_LENGTH; i++) {
    code += SUPPORT_CODE_ALPHABET[randomInt(SUPPORT_CODE_ALPHABET.length)];
  }
  return code;
}

@Injectable()
export class UsersStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async findById(id: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row ?? null;
  }

  async findByIdentity(provider: IdentityProviderName, subject: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select({ user: users })
      .from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.userId))
      .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)));
    return row?.user ?? null;
  }

  /** Call inside a transaction: the user and the identity are created together or not at all. */
  async createWithIdentity(provider: IdentityProviderName, subject: string): Promise<UserRow> {
    const [user] = await this.db
      .insert(users)
      .values({ supportCode: generateSupportCode() })
      .returning();
    await this.db.insert(userIdentities).values({ userId: user!.id, provider, subject });
    return user!;
  }

  async touchLastSeen(id: string): Promise<void> {
    await this.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
  }

  /** Identities go with the user through the cascading foreign key. */
  async delete(id: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }
}
