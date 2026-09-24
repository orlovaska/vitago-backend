import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { hash } from '@node-rs/argon2';
import { isUniqueViolation } from '../../platform/database';
import { AppError } from '../../platform/http';
import { type AdminWithRole, AdminsStore } from './stores/admins.store';
import { type RoleRow, RolesStore } from './stores/roles.store';

const MIN_PASSWORD_LENGTH = 12;

/** 24 characters; shown once and never stored in plain text. */
const generatePassword = () => randomBytes(18).toString('base64url');

export interface CreatedAdmin {
  account: AdminWithRole;
  password: string;
}

export interface AdminChanges {
  roleId?: string;
  disabled?: boolean;
}

/**
 * Administrators are disabled, never deleted: other modules keep their ids
 * (a moderated review remembers who moderated it).
 */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly admins: AdminsStore,
    private readonly roles: RolesStore,
  ) {}

  list(): Promise<AdminWithRole[]> {
    return this.admins.list();
  }

  /** Without a password one is generated; either way it is returned once. */
  async create(
    login: string,
    roleId: string,
    password: string = generatePassword(),
  ): Promise<CreatedAdmin> {
    assertStrongPassword(password);
    await this.requireRole(roleId);
    try {
      const admin = await this.admins.create(login, await hash(password), roleId);
      return { account: (await this.admins.findWithRole(admin.id))!, password };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('admin_exists', `Admin "${login}" already exists`);
      }
      throw error;
    }
  }

  /**
   * `actorId` is the administrator making the change, or null for the CLI,
   * which runs on the server and may change anyone.
   */
  @Transactional()
  async update(actorId: string | null, id: string, changes: AdminChanges): Promise<AdminWithRole> {
    if (actorId === id) {
      throw AppError.conflict(
        'own_account',
        'An administrator cannot change their own role or disable themselves',
      );
    }
    // Locked before reading the target, so the check below sees committed changes only.
    const superadmins = await this.admins.lockActiveSuperadmins();
    const current = await this.requireAdmin(id);

    const role =
      changes.roleId === undefined ? current.role : await this.requireRole(changes.roleId);
    const disabledAt =
      changes.disabled === undefined
        ? current.admin.disabledAt
        : changes.disabled
          ? (current.admin.disabledAt ?? new Date())
          : null;

    const staysSuperadmin = role.systemCode === 'superadmin' && disabledAt === null;
    if (!staysSuperadmin && superadmins.length === 1 && superadmins[0] === id) {
      throw AppError.conflict('last_superadmin', 'At least one active superadmin must remain');
    }

    await this.admins.update(id, { roleId: role.id, disabledAt });
    return (await this.admins.findWithRole(id))!;
  }

  /** Generates a new password; sessions opened with the old one end at once. */
  async resetPassword(id: string): Promise<string> {
    await this.requireAdmin(id);
    const password = generatePassword();
    await this.admins.updatePasswordHash(id, await hash(password));
    return password;
  }

  private async requireAdmin(id: string): Promise<AdminWithRole> {
    const account = await this.admins.findWithRole(id);
    if (!account) throw AppError.notFound('admin_not_found', 'Administrator not found');
    return account;
  }

  private async requireRole(id: string): Promise<RoleRow> {
    const role = await this.roles.findById(id);
    if (!role) throw AppError.badRequest('unknown_role', 'No such role');
    return role;
  }
}

function assertStrongPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw AppError.badRequest(
      'weak_password',
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}
