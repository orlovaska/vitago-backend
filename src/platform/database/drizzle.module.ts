import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { AppConfig } from '../config';
import { DRIZZLE, SQL_CLIENT } from './database.tokens';

@Module({
  providers: [
    {
      provide: SQL_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Sql =>
        postgres(config.env.DATABASE_URL, {
          max: config.env.DATABASE_POOL_SIZE,
          onnotice: () => undefined,
        }),
    },
    {
      provide: DRIZZLE,
      inject: [SQL_CLIENT],
      // Must match `casing` in drizzle.config.ts: camelCase in code, snake_case in the database.
      useFactory: (client: Sql) => drizzle({ client, casing: 'snake_case' }),
    },
  ],
  exports: [SQL_CLIENT, DRIZZLE],
})
export class DrizzleModule implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
