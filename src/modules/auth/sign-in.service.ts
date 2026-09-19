import { Injectable } from '@nestjs/common';
import { type DbTxHost, InjectDb, isUniqueViolation } from '../../platform/database';
import { type AuthProvider } from './providers/auth-provider';
import { type IssuedToken, TokensService } from './tokens.service';
import { type UserRow, UsersStore } from './users.store';

export interface SignInResult extends IssuedToken {
  user: UserRow;
  /** True when this sign-in created the account. */
  created: boolean;
}

/** Collisions of the random support code are rare; a few retries are plenty. */
const MAX_CREATE_ATTEMPTS = 3;

@Injectable()
export class SignInService {
  constructor(
    @InjectDb() private readonly txHost: DbTxHost,
    private readonly users: UsersStore,
    private readonly tokens: TokensService,
  ) {}

  /** Finds the account behind the credentials, creating it on first sign-in. */
  async signIn<T>(provider: AuthProvider<T>, credentials: T): Promise<SignInResult> {
    const subject = await provider.resolveSubject(credentials);
    const { user, created } = await this.findOrCreate(provider, subject);
    await this.users.touchLastSeen(user.id);
    return { user, created, ...(await this.tokens.issue('app', user.id)) };
  }

  private async findOrCreate(
    provider: AuthProvider<unknown>,
    subject: string,
  ): Promise<{ user: UserRow; created: boolean }> {
    for (let attempt = 1; ; attempt++) {
      const existing = await this.users.findByIdentity(provider.name, subject);
      if (existing) return { user: existing, created: false };
      try {
        const user = await this.txHost.withTransaction(() =>
          this.users.createWithIdentity(provider.name, subject),
        );
        return { user, created: true };
      } catch (error) {
        // Either the same device signed in concurrently (the next lookup finds it)
        // or the support code collided (the next attempt draws a new one).
        if (!isUniqueViolation(error) || attempt >= MAX_CREATE_ATTEMPTS) throw error;
      }
    }
  }
}
