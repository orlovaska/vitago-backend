import { Module } from '@nestjs/common';
import { AdminSignInService } from './admin-sign-in.service';
import { AdminsStore } from './admins.store';
import { AuthFacade } from './auth.facade';
import { AdminAuthGuard, UserAuthGuard } from './guards';
import { AuthAdminController } from './http/auth-admin.controller';
import { AuthController } from './http/auth.controller';
import { DeviceProvider } from './providers/device.provider';
import { SignInService } from './sign-in.service';
import { TokensService } from './tokens.service';
import { UsersStore } from './users.store';

/**
 * Sign-in for app users and administrators. Every module with protected
 * routes imports AuthModule so the guards can resolve their dependencies.
 */
@Module({
  controllers: [AuthController, AuthAdminController],
  providers: [
    TokensService,
    UserAuthGuard,
    AdminAuthGuard,
    UsersStore,
    SignInService,
    DeviceProvider,
    AdminsStore,
    AdminSignInService,
    AuthFacade,
  ],
  // Guards run in the injector of the module that uses them, so their dependencies are exported too.
  exports: [TokensService, UsersStore, AdminsStore, UserAuthGuard, AdminAuthGuard, AuthFacade],
})
export class AuthModule {}
