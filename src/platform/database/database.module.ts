import { Global, Module } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterDrizzleOrm } from '@nestjs-cls/transactional-adapter-drizzle-orm';
import { ClsModule } from 'nestjs-cls';
import { type Database, DRIZZLE } from './database.tokens';
import { DrizzleModule } from './drizzle.module';

@Global()
@Module({
  imports: [
    DrizzleModule,
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [DrizzleModule],
          adapter: new TransactionalAdapterDrizzleOrm<Database>({ drizzleInstanceToken: DRIZZLE }),
        }),
      ],
    }),
  ],
  exports: [DrizzleModule],
})
export class DatabaseModule {}
