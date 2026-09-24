import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { isUniqueViolation } from '../../platform/database';
import { AppError } from '../../platform/http';
import {
  type AdminPermission,
  SUPERADMIN_ONLY_PERMISSIONS,
  type SystemRole,
} from './admin-permissions';
import { AdminsStore } from './stores/admins.store';
import { type RoleFields, type RoleRow, RolesStore } from './stores/roles.store';

/** System roles are fixed by migrations; a superadmin creates and edits the rest. */
@Injectable()
export class AdminRolesService {
  constructor(
    private readonly roles: RolesStore,
    private readonly admins: AdminsStore,
  ) {}

  list(): Promise<RoleRow[]> {
    return this.roles.list();
  }

  async bySystemCode(code: SystemRole): Promise<RoleRow> {
    const role = await this.roles.findBySystemCode(code);
    // Seeded by the migration that introduced roles; missing means migrations were not applied.
    if (!role) throw new Error(`System role "${code}" is missing; run the migrations`);
    return role;
  }

  async create(fields: RoleFields): Promise<RoleRow> {
    return this.saving(fields.name, () =>
      this.roles.create({ ...fields, permissions: assignable(fields.permissions) }),
    );
  }

  @Transactional()
  async update(id: string, changes: Partial<RoleFields>): Promise<RoleRow> {
    const role = await this.requireCustomRole(id);
    if (changes.name === undefined && changes.permissions === undefined) return role;
    return this.saving(changes.name ?? role.name, () =>
      this.roles.update(id, {
        ...(changes.name !== undefined && { name: changes.name }),
        ...(changes.permissions !== undefined && {
          permissions: assignable(changes.permissions),
        }),
      }),
    );
  }

  @Transactional()
  async remove(id: string): Promise<void> {
    await this.requireCustomRole(id);
    if ((await this.admins.countByRole(id)) > 0) {
      throw AppError.conflict('role_in_use', 'Move its administrators to another role first');
    }
    await this.roles.delete(id);
  }

  private async requireCustomRole(id: string): Promise<RoleRow> {
    const role = await this.roles.findById(id);
    if (!role) throw AppError.notFound('role_not_found', 'Role not found');
    if (role.systemCode) {
      throw AppError.conflict('system_role', 'System roles cannot be changed or deleted');
    }
    return role;
  }

  private async saving(name: string, save: () => Promise<RoleRow>): Promise<RoleRow> {
    try {
      return await save();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('role_exists', `Role "${name}" already exists`);
      }
      throw error;
    }
  }
}

function assignable(permissions: readonly AdminPermission[]): AdminPermission[] {
  const reserved = permissions.find((permission) =>
    SUPERADMIN_ONLY_PERMISSIONS.includes(permission),
  );
  if (reserved) {
    throw AppError.badRequest(
      'permission_not_assignable',
      `Only the superadmin holds the "${reserved}" permission`,
    );
  }
  return [...new Set(permissions)];
}
