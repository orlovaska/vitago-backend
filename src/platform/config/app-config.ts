import { type Env } from './env.schema';

/**
 * Validated configuration, injected wherever settings are needed.
 * Declared as a class so it can be used as a Nest injection token.
 */
export class AppConfig {
  constructor(readonly env: Env) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
