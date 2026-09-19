import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ApiBadRequestResponse, ApiHeader } from '@nestjs/swagger';
import { type Request } from 'express';
import { AppError } from '../http/app-error';
import { type AppContext, AppDirectory } from './app-directory';

/** Header every app build sends with its bundle id / application id. */
export const BUNDLE_ID_HEADER = 'x-bundle-id';

interface RequestWithApp extends Request {
  appContext?: AppContext;
}

@Injectable()
export class RequiresAppGuard implements CanActivate {
  constructor(private readonly directory: AppDirectory) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApp>();
    const bundleId = request.header(BUNDLE_ID_HEADER)?.trim();
    if (!bundleId) {
      throw AppError.badRequest('app_required', `The ${BUNDLE_ID_HEADER} header is required`);
    }
    const app = await this.directory.findByBundleId(bundleId);
    if (!app) throw AppError.badRequest('unknown_app', `Unknown app "${bundleId}"`);
    request.appContext = app;
    return true;
  }
}

/**
 * Marks a controller or route as app-specific: the X-Bundle-Id header is
 * required and must name a known app, otherwise 400. There is no fallback app.
 */
export const RequiresApp = () =>
  applyDecorators(
    UseGuards(RequiresAppGuard),
    ApiHeader({ name: 'X-Bundle-Id', required: true, description: 'Bundle id of the city app' }),
    ApiBadRequestResponse({ description: 'Missing or unknown X-Bundle-Id' }),
  );

/** The calling app; only valid behind @RequiresApp(). */
export const CurrentApp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AppContext => {
    const app = context.switchToHttp().getRequest<RequestWithApp>().appContext;
    if (!app) throw new Error('@CurrentApp() used on a route without @RequiresApp()');
    return app;
  },
);
