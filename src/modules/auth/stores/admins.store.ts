import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { adminLoginAttempts, adminRoles, admins } from '../auth.tables';
import { type RoleRow } from './roles.store';

export type AdminRow = typeof admins.$inferSelect;

export interface AdminWithRole {
  admin: AdminRow;
  role: RoleRow;
}

@Injectable()
export class AdminsStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  private selectWithRole() {
    return this.db
      .select({ admin: admins, role: adminRoles })
      .from(admins)
      .innerJoin(adminRoles, eq(adminRoles.id, admins.roleId));
  }

  async findActiveByLogin(login: string): Promise<AdminWithRole | null> {
    const [row] = await this.selectWithRole().where(eq(admins.login, login));
    return row && !row.admin.disabledAt ? row : null;
  }

  async findWithRole(id: string): Promise<AdminWithRole | null> {
    const [row] = await this.selectWithRole().where(eq(admins.id, id));
    return row ?? null;
  }

  async list(): Promise<AdminWithRole[]> {
    return this.selectWithRole().orderBy(asc(admins.login));
  }

  async create(login: string, passwordHash: string, roleId: string): Promise<AdminRow> {
    const [row] = await this.db.insert(admins).values({ login, passwordHash, roleId }).returning();
    return row!;
  }

  /** A new password signs the administrator out of every session opened with the old one. */
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(admins)
      .set({ passwordHash, sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(eq(admins.id, id));
  }

  async update(id: string, changes: { roleId?: string; disabledAt?: Date | null }): Promise<void> {
    await this.db.update(admins).set(changes).where(eq(admins.id, id));
  }

  /**
   * Ids of the active superadmins, locked until the transaction ends: two
   * superadmins demoting each other at once must not leave nobody in charge.
   */
  async lockActiveSuperadmins(): Promise<string[]> {
    // No join: Postgres wants `FOR UPDATE OF` unqualified, and drizzle qualifies it with the schema.
    const superadminRole = this.db
      .select({ id: adminRoles.id })
      .from(adminRoles)
      .where(eq(adminRoles.systemCode, 'superadmin'));
    const rows = await this.db
      .select({ id: admins.id })
      .from(admins)
      .where(and(inArray(admins.roleId, superadminRole), isNull(admins.disabledAt)))
      .for('update');
    return rows.map((row) => row.id);
  }

  async countByRole(roleId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(admins)
      .where(eq(admins.roleId, roleId));
    return row?.total ?? 0;
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
