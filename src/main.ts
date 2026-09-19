import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig, loadDotEnvFile } from './platform/config';
import { configureHttp, serveOpenApiDocs } from './platform/http';

async function bootstrap(): Promise<void> {
  loadDotEnvFile();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureHttp(app);

  const config = app.get(AppConfig);
  if (config.env.OPENAPI_DOCS ?? !config.isProduction) {
    serveOpenApiDocs(app);
  }
  await app.listen(config.env.PORT);
}

void bootstrap();
