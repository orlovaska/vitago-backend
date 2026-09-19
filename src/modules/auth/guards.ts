import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { type Request } from 'express';
import { ADMIN_AUTH, AppError, USER_AUTH } from '../../platform/http';
import { type TokenAudience, TokensService } from './tokens.service';

interface AuthenticatedRequest extends Request {
  userId?: string;
  adminId?: string;
}

function bearerToken(request: Request): string | null {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

abstract class BearerGuard implements CanActivate {
  protected abstract readonly audience: TokenAudience;
  protected abstract attach(request: AuthenticatedRequest, subject: string): void;

  constructor(private readonly tokens: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    const subject = token ? await this.tokens.verify(this.audience, token) : null;
    if (!subject) {
      throw AppError.unauthorized('unauthorized', 'A valid access token is required');
    }
    this.attach(request, subject);
    return true;
  }
}

@Injectable()
export class UserAuthGuard extends BearerGuard {
  protected readonly audience = 'app';
  protected attach(request: AuthenticatedRequest, subject: string): void {
    request.userId = subject;
  }
}

@Injectable()
export class AdminAuthGuard extends BearerGuard {
  protected readonly audience = 'admin';
  protected attach(request: AuthenticatedRequest, subject: string): void {
    request.adminId = subject;
  }
}

/** Requires an app user's access token on the whole controller or one route. */
export const UserAuth = () =>
  applyDecorators(UseGuards(UserAuthGuard), ApiBearerAuth(USER_AUTH), ApiUnauthorizedResponse());

/** Requires an administrator's access token. Put on every *-admin.controller.ts. */
export const AdminAuth = () =>
  applyDecorators(UseGuards(AdminAuthGuard), ApiBearerAuth(ADMIN_AUTH), ApiUnauthorizedResponse());

/** Id of the signed-in user; only valid behind @UserAuth(). */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const userId = context.switchToHttp().getRequest<AuthenticatedRequest>().userId;
    if (!userId) throw new Error('@CurrentUserId() used on a route without @UserAuth()');
    return userId;
  },
);

/** Id of the signed-in administrator; only valid behind @AdminAuth(). */
export const CurrentAdminId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const adminId = context.switchToHttp().getRequest<AuthenticatedRequest>().adminId;
    if (!adminId) throw new Error('@CurrentAdminId() used on a route without @AdminAuth()');
    return adminId;
  },
);
