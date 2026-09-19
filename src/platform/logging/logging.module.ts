import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { type TransportTargetOptions } from 'pino';
import { AppConfig } from '../config';

/** Base name of rotated files; the logs module lists files by this prefix. */
export const LOG_FILE_PREFIX = 'api';

function buildTargets(config: AppConfig): TransportTargetOptions[] {
  const { env } = config;
  const targets: TransportTargetOptions[] = [
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', level: env.LOG_LEVEL, options: { singleLine: true } }
      : { target: 'pino/file', level: env.LOG_LEVEL, options: { destination: 1 } },
  ];

  if (env.LOG_DIR) {
    targets.push({
      target: 'pino-roll',
      level: env.LOG_LEVEL,
      options: {
        file: join(env.LOG_DIR, LOG_FILE_PREFIX),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        size: env.LOG_FILE_SIZE,
        mkdir: true,
        limit: { count: env.LOG_MAX_FILES, removeOtherLogFiles: true },
      },
    });
  }
  return targets;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.env.LOG_LEVEL,
          transport: { targets: buildTargets(config) },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
