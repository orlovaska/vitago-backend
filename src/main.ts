import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig, loadDotEnvFile } from './platform/config';

async function bootstrap(): Promise<void> {
  loadDotEnvFile();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(app.get(AppConfig).env.PORT);
}

void bootstrap();
