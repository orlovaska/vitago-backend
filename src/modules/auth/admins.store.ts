import { Injectable } from '@nestjs/common';
import { and, count, eq, gt } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { adminLoginAttempts, admins } from './auth.tables';

export type AdminRow = typeof admins.$inferSelect;

@Injectable()
export class AdminsStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async findActiveByLogin(login: string): Promise<AdminRow | null> {
    const [row] = await this.db.select().from(admins).where(eq(admins.login, login));
    return row && !row.disabledAt ? row : null;
  }

  async findById(id: string): Promise<AdminRow | null> {
    const [row] = await this.db.select().from(admins).where(eq(admins.id, id));
    return row ?? null;
  }

  async create(login: string, passwordHash: string): Promise<AdminRow> {
    const [row] = await this.db.insert(admins).values({ login, passwordHash }).returning();
    return row!;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db.update(admins).set({ passwordHash }).where(eq(admins.id, id));
  }

  async recordAttempt(login: string, ip: string | null, succeeded: boolean): Promise<void> {
    await this.db.insert(adminLoginAttempts).values({ login, ip, succeeded });
  }

  async countFailuresSince(login: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ failures: count() })
      .from(adminLoginAttempts)
      .where(
        and(
          eq(adminLoginAttempts.login, login),
          eq(adminLoginAttempts.succeeded, false),
          gt(adminLoginAttempts.createdAt, since),
        ),
      );
    return row?.failures ?? 0;
  }
}
