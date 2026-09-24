import { Injectable } from '@nestjs/common';
import { AppError } from '../../platform/http';
import { AdminAccountsService } from './admin-accounts.service';
import { type SystemRole } from './admin-permissions';
import { AdminRolesService } from './admin-roles.service';
import { type AdminWithRole, AdminsStore } from './stores/admins.store';
import { UsersStore } from './stores/users.store';

export interface UserSummary {
  id: string;
  supportCode: string;
  createdAt: Date;
  lastSeenAt: Date;
}

/** What other modules and CLI commands may ask of `auth`. */
@Injectable()
export class AuthFacade {
  constructor(
    private readonly users: UsersStore,
    private readonly admins: AdminsStore,
    private readonly accounts: AdminAccountsService,
    private readonly roles: AdminRolesService,
  ) {}

  async findUser(userId: string): Promise<UserSummary | null> {
    const user = await this.users.findById(userId);
    return user && { ...user };
  }

  /** Account deletion step: removes the user and every identity. Idempotent. */
  async deleteUser(userId: string): Promise<void> {
    await this.users.delete(userId);
  }

  /** Creates an administrator with a system role; without a password one is generated. */
  async createAdmin(
    login: string,
    options: { role?: SystemRole; password?: string } = {},
  ): Promise<{ id: string; login: string; password: string }> {
    const role = await this.roles.bySystemCode(options.role ?? 'superadmin');
    const { account, password } = await this.accounts.create(login, role.id, options.password);
    return { id: account.admin.id, login: account.admin.login, password };
  }

  /** Returns the generated password; it is shown once and never stored in plain text. */
  async resetAdminPassword(login: string): Promise<string> {
    return this.accounts.resetPassword((await this.activeAdmin(login)).admin.id);
  }

  async setAdminRole(login: string, role: SystemRole): Promise<void> {
    const { id } = await this.roles.bySystemCode(role);
    await this.accounts.update(null, (await this.activeAdmin(login)).admin.id, { roleId: id });
  }

  private async activeAdmin(login: string): Promise<AdminWithRole> {
    const account = await this.admins.findActiveByLogin(login);
    if (!account) throw AppError.notFound('admin_not_found', `Admin "${login}" not found`);
    return account;
  }
}
