import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, AppError } from '../../../platform/http';
import { AdminSignInService } from '../admin-sign-in.service';
import { AdminsStore } from '../admins.store';
import { AdminAuth, CurrentAdminId } from '../guards';
import { AdminDto, AdminSignInDto, AdminSignInResponseDto } from './auth.dto';

@ApiTags(ADMIN_TAG)
@Controller('admin/auth')
export class AuthAdminController {
  constructor(
    private readonly signIn: AdminSignInService,
    private readonly admins: AdminsStore,
  ) {}

  @Post('login')
  @ZodResponse({ status: 200, type: AdminSignInResponseDto })
  async login(@Body() body: AdminSignInDto, @Ip() ip: string | undefined) {
    const result = await this.signIn.signIn(body.login, body.password, ip ?? null);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      admin: { id: result.admin.id, login: result.admin.login },
    };
  }

  @Get('me')
  @AdminAuth()
  @ZodResponse({ status: 200, type: AdminDto })
  async me(@CurrentAdminId() adminId: string) {
    const admin = await this.admins.findById(adminId);
    if (!admin || admin.disabledAt) {
      throw AppError.unauthorized('admin_not_found', 'The administrator no longer exists');
    }
    return { id: admin.id, login: admin.login };
  }
}
