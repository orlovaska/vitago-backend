import { type INestApplication } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from '../config';

/** Every product endpoint lives under this prefix; probes stay outside it. */
export const API_PREFIX = 'v1';

/** Settings that must be identical in the running server, tests and the OpenAPI export. */
export function configureHttp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  const config = app.get(AppConfig);

  express.setGlobalPrefix(API_PREFIX, { exclude: ['health/*path'] });
  express.disable('x-powered-by');
  // nginx terminates TLS in front of the API.
  express.set('trust proxy', 'loopback, uniquelocal');

  // The mobile app, the desktop admin and bank webhooks send no Origin header,
  // so production serves no CORS headers at all. Browsers are allowed only in development.
  if (!config.isProduction && config.env.CORS_ORIGINS.length > 0) {
    express.enableCors({ origin: config.env.CORS_ORIGINS });
  }
}
