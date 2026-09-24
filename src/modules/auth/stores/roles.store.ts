import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { type AdminPermission, SYSTEM_ROLES, type SystemRole } from '../admin-permissions';
import { adminRoles } from '../auth.tables';

export type RoleRow = typeof adminRoles.$inferSelect;

export interface RoleFields {
  name: string;
  permissions: AdminPermission[];
}

@Injectable()
export class RolesStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  /** System roles first, in the order of `SYSTEM_ROLES`, then the custom ones by name. */
  async list(): Promise<RoleRow[]> {
    const rank = (role: RoleRow) =>
      role.systemCode ? SYSTEM_ROLES.indexOf(role.systemCode) : SYSTEM_ROLES.length;
    const rows = await this.db.select().from(adminRoles);
    return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ru'));
  }

  async findById(id: string): Promise<RoleRow | null> {
    const [row] = await this.db.select().from(adminRoles).where(eq(adminRoles.id, id));
    return row ?? null;
  }

  async findBySystemCode(code: SystemRole): Promise<RoleRow | null> {
    const [row] = await this.db.select().from(adminRoles).where(eq(adminRoles.systemCode, code));
    return row ?? null;
  }

  async create(fields: RoleFields): Promise<RoleRow> {
    const [row] = await this.db.insert(adminRoles).values(fields).returning();
    return row!;
  }

  async update(id: string, changes: Partial<RoleFields>): Promise<RoleRow> {
    const [row] = await this.db
      .update(adminRoles)
      .set(changes)
      .where(eq(adminRoles.id, id))
      .returning();
    return row!;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(adminRoles).where(eq(adminRoles.id, id));
  }
}
