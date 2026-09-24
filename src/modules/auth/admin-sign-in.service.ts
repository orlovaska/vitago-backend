import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { AppError } from '../../platform/http';
import { type AdminWithRole, AdminsStore } from './stores/admins.store';
import { type IssuedToken, TokensService } from './tokens.service';

/** Five wrong passwords for one login lock it for the rest of the 15-minute window. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** Verified against when the login does not exist, so response time does not reveal it. */
const DUMMY_HASH = hash(randomBytes(32));

export interface AdminSignInResult extends IssuedToken {
  account: AdminWithRole;
}

@Injectable()
export class AdminSignInService {
  constructor(
    private readonly admins: AdminsStore,
    private readonly tokens: TokensService,
  ) {}

  async signIn(login: string, password: string, ip: string | null): Promise<AdminSignInResult> {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    if ((await this.admins.countFailuresSince(login, since)) >= MAX_FAILED_ATTEMPTS) {
      throw AppError.tooManyRequests(
        'too_many_attempts',
        'Too many failed sign-in attempts; try again later',
      );
    }

    const account = await this.admins.findActiveByLogin(login);
    const valid = await verify(account?.admin.passwordHash ?? (await DUMMY_HASH), password);
    await this.admins.recordAttempt(login, ip, valid && account !== null);

    if (!account || !valid) {
      throw AppError.unauthorized('invalid_credentials', 'Wrong login or password');
    }
    const { admin } = account;
    return { account, ...(await this.tokens.issue('admin', admin.id, admin.sessionVersion)) };
  }
}
