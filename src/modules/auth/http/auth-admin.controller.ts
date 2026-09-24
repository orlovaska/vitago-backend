import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, AppError, IdParamDto } from '../../../platform/http';
import { AdminAccountsService } from '../admin-accounts.service';
import { ASSIGNABLE_PERMISSIONS, effectivePermissions } from '../admin-permissions';
import { AdminRolesService } from '../admin-roles.service';
import { AdminSignInService } from '../admin-sign-in.service';
import { AdminAuth, CurrentAdminId } from '../guards';
import { type AdminWithRole, AdminsStore } from '../stores/admins.store';
import { type RoleRow } from '../stores/roles.store';
import {
  AdminAccountDto,
  AdminAccountListDto,
  AdminDto,
  AdminSignInDto,
  AdminSignInResponseDto,
  CreateAdminDto,
  CreatedAdminDto,
  CreateRoleDto,
  GeneratedPasswordDto,
  RoleDto,
  RoleListDto,
  UpdateAdminDto,
  UpdateRoleDto,
} from './auth.dto';

const toRole = (role: RoleRow) => ({
  id: role.id,
  name: role.name,
  systemCode: role.systemCode,
  permissions: effectivePermissions(role),
});

const toAdmin = ({ admin, role }: AdminWithRole) => ({
  id: admin.id,
  login: admin.login,
  role: toRole(role),
});

const toAdminAccount = (account: AdminWithRole) => ({
  ...toAdmin(account),
  createdAt: account.admin.createdAt.toISOString(),
  disabledAt: account.admin.disabledAt?.toISOString() ?? null,
});

@ApiTags(ADMIN_TAG)
@Controller('admin')
export class AuthAdminController {
  constructor(
    private readonly signIn: AdminSignInService,
    private readonly admins: AdminsStore,
    private readonly accounts: AdminAccountsService,
    private readonly roles: AdminRolesService,
  ) {}

  // ---- Sign-in ----

  @Post('auth/login')
  @ZodResponse({ status: 200, type: AdminSignInResponseDto })
  async login(@Body() body: AdminSignInDto, @Ip() ip: string | undefined) {
    const result = await this.signIn.signIn(body.login, body.password, ip ?? null);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      admin: toAdmin(result.account),
    };
  }

  /** Every role may ask who it is: the desktop panel builds its menu from the permissions. */
  @Get('auth/me')
  @AdminAuth()
  @ZodResponse({ status: 200, type: AdminDto })
  async me(@CurrentAdminId() adminId: string) {
    const account = await this.admins.findWithRole(adminId);
    if (!account || account.admin.disabledAt) {
      throw AppError.unauthorized('admin_not_found', 'The administrator no longer exists');
    }
    return toAdmin(account);
  }

  // ---- Administrators ----

  @Get('admins')
  @AdminAuth('admins')
  @ZodResponse({ status: 200, type: AdminAccountListDto })
  async listAdmins() {
    return { items: (await this.accounts.list()).map(toAdminAccount) };
  }

  @Post('admins')
  @AdminAuth('admins')
  @ZodResponse({ status: 201, type: CreatedAdminDto })
  async createAdmin(@Body() body: CreateAdminDto) {
    const { account, password } = await this.accounts.create(body.login, body.roleId);
    return { admin: toAdminAccount(account), password };
  }

  /** Changes another administrator's role or disables them; nobody changes their own account. */
  @Patch('admins/:id')
  @AdminAuth('admins')
  @ZodResponse({ status: 200, type: AdminAccountDto })
  async updateAdmin(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateAdminDto,
    @CurrentAdminId() adminId: string,
  ) {
    return toAdminAccount(await this.accounts.update(adminId, id, body));
  }

  @Post('admins/:id/reset-password')
  @AdminAuth('admins')
  @ZodResponse({ status: 200, type: GeneratedPasswordDto })
  async resetPassword(@Param() { id }: IdParamDto) {
    return { password: await this.accounts.resetPassword(id) };
  }

  // ---- Roles ----

  @Get('roles')
  @AdminAuth('admins')
  @ZodResponse({ status: 200, type: RoleListDto })
  async listRoles() {
    return {
      items: (await this.roles.list()).map(toRole),
      assignablePermissions: [...ASSIGNABLE_PERMISSIONS],
    };
  }

  @Post('roles')
  @AdminAuth('admins')
  @ZodResponse({ status: 201, type: RoleDto })
  async createRole(@Body() body: CreateRoleDto) {
    return toRole(await this.roles.create(body));
  }

  @Patch('roles/:id')
  @AdminAuth('admins')
  @ZodResponse({ status: 200, type: RoleDto })
  async updateRole(@Param() { id }: IdParamDto, @Body() body: UpdateRoleDto) {
    return toRole(await this.roles.update(id, body));
  }

  @Delete('roles/:id')
  @AdminAuth('admins')
  @HttpCode(204)
  async removeRole(@Param() { id }: IdParamDto): Promise<void> {
    await this.roles.remove(id);
  }
}
