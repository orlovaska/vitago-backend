import { type DynamicModule, Global, Module, type ModuleMetadata, type Type } from '@nestjs/common';
import { AppDirectory } from './app-directory';

/**
 * Binds the AppDirectory port to its implementation once, at the
 * composition root, and makes it visible to every module's guards.
 */
@Global()
@Module({})
export class AppContextModule {
  static forRoot(options: {
    imports: ModuleMetadata['imports'];
    directory: Type<AppDirectory>;
  }): DynamicModule {
    return {
      module: AppContextModule,
      imports: options.imports,
      providers: [{ provide: AppDirectory, useExisting: options.directory }],
      exports: [AppDirectory],
    };
  }
}
