import { Global, Module } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { ClsModule } from 'nestjs-cls';
import { DrizzleModule } from './drizzle.module';
import { DrizzleTransactionalAdapter } from './drizzle-transactional-adapter';

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
          adapter: new DrizzleTransactionalAdapter(),
        }),
      ],
    }),
  ],
  exports: [DrizzleModule],
})
export class DatabaseModule {}
