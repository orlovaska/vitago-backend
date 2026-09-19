import { Module } from '@nestjs/common';
import { AdminAuthGuard, UserAuthGuard } from './guards';
import { TokensService } from './tokens.service';

/**
 * Sign-in for app users and administrators. Every module with protected
 * routes imports AuthModule so the guards can resolve their dependencies.
 */
@Module({
  providers: [TokensService, UserAuthGuard, AdminAuthGuard],
  exports: [TokensService, UserAuthGuard, AdminAuthGuard],
})
export class AuthModule {}
