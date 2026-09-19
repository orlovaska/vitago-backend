import { Module } from '@nestjs/common';
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
  ],
  exports: [TokensService, UserAuthGuard, AdminAuthGuard],
})
export class AuthModule {}
