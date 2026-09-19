import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig, loadDotEnvFile } from './platform/config';

async function bootstrap(): Promise<void> {
  loadDotEnvFile();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(app.get(AppConfig).env.PORT);
}

void bootstrap();
