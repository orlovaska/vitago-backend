import { Module } from '@nestjs/common';
import { AdminSignInService } from './admin-sign-in.service';
import { AdminsStore } from './admins.store';
import { AuthFacade } from './auth.facade';
import { AdminAuthGuard, UserAuthGuard } from './guards';
import { DeviceProvider } from './providers/device.provider';
import { SignInService } from './sign-in.service';
import { TokensService } from './tokens.service';
import { UsersStore } from './users.store';

/**
 * Sign-in for app users and administrators. Every module with protected
 * routes imports AuthModule so the guards can resolve their dependencies.
 */
@Module({
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
  exports: [TokensService, UserAuthGuard, AdminAuthGuard, AuthFacade],
})
export class AuthModule {}
