import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { AppError } from '../../platform/http';
import { isUniqueViolation } from '../../platform/database';
import { type AdminRow, AdminsStore } from './admins.store';
import { type IssuedToken, TokensService } from './tokens.service';

/** Five wrong passwords for one login lock it for the rest of the 15-minute window. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;

/** Verified against when the login does not exist, so response time does not reveal it. */
const DUMMY_HASH = hash(randomBytes(32));

export interface AdminSignInResult extends IssuedToken {
  admin: AdminRow;
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

    const admin = await this.admins.findActiveByLogin(login);
    const valid = await verify(admin?.passwordHash ?? (await DUMMY_HASH), password);
    await this.admins.recordAttempt(login, ip, valid && admin !== null);

    if (!admin || !valid) {
      throw AppError.unauthorized('invalid_credentials', 'Wrong login or password');
    }
    return { admin, ...(await this.tokens.issue('admin', admin.id)) };
  }

  async createAdmin(login: string, password: string): Promise<AdminRow> {
    assertStrongPassword(password);
    try {
      return await this.admins.create(login, await hash(password));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('admin_exists', `Admin "${login}" already exists`);
      }
      throw error;
    }
  }

  async setPassword(login: string, password: string): Promise<void> {
    assertStrongPassword(password);
    const admin = await this.admins.findActiveByLogin(login);
    if (!admin) throw AppError.notFound('admin_not_found', `Admin "${login}" not found`);
    await this.admins.updatePasswordHash(admin.id, await hash(password));
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
