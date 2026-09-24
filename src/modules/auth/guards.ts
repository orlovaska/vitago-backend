import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { type Request } from 'express';
import { ADMIN_AUTH, AppError, USER_AUTH } from '../../platform/http';
import { type AdminPermission, effectivePermissions } from './admin-permissions';
import { AdminsStore } from './stores/admins.store';
import { UsersStore } from './stores/users.store';
import { type TokenAudience, TokensService, type VerifiedToken } from './tokens.service';

const ADMIN_PERMISSIONS_KEY = 'vitago:admin-permissions';

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
  /**
   * Attaches the account to the request, or returns false to answer 401.
   * A valid signature is not enough: the account may have been deleted or disabled since.
   */
  protected abstract accept(
    request: AuthenticatedRequest,
    token: VerifiedToken,
    context: ExecutionContext,
  ): Promise<boolean>;

  // Subclasses declare their own constructor: TypeScript emits the parameter
  // metadata Nest needs only on decorated classes, and this base is not one.
  constructor(private readonly tokens: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    const verified = token ? await this.tokens.verify(this.audience, token) : null;
    if (!verified || !(await this.accept(request, verified, context))) {
      throw AppError.unauthorized('unauthorized', 'A valid access token is required');
    }
    return true;
  }
}

@Injectable()
export class UserAuthGuard extends BearerGuard {
  protected readonly audience = 'app';

  constructor(
    tokens: TokensService,
    private readonly users: UsersStore,
  ) {
    super(tokens);
  }

  protected async accept(request: AuthenticatedRequest, token: VerifiedToken): Promise<boolean> {
    if (!(await this.users.findById(token.subject))) return false;
    request.userId = token.subject;
    return true;
  }
}

@Injectable()
export class AdminAuthGuard extends BearerGuard {
  protected readonly audience = 'admin';

  constructor(
    tokens: TokensService,
    private readonly admins: AdminsStore,
    private readonly reflector: Reflector,
  ) {
    super(tokens);
  }

  /** The role is read on every request, so a new role or a disabled account applies at once. */
  protected async accept(
    request: AuthenticatedRequest,
    token: VerifiedToken,
    context: ExecutionContext,
  ): Promise<boolean> {
    const found = await this.admins.findWithRole(token.subject);
    if (!found || found.admin.disabledAt || found.admin.sessionVersion !== token.version) {
      return false;
    }
    const required =
      this.reflector.getAllAndOverride<AdminPermission[] | undefined>(ADMIN_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const granted = effectivePermissions(found.role);
    if (required.length > 0 && !required.some((permission) => granted.includes(permission))) {
      throw AppError.forbidden('forbidden', 'The administrator role does not allow this action');
    }
    request.adminId = token.subject;
    return true;
  }
}

/** Requires an app user's access token on the whole controller or one route. */
export const UserAuth = () =>
  applyDecorators(UseGuards(UserAuthGuard), ApiBearerAuth(USER_AUTH), ApiUnauthorizedResponse());

/**
 * Requires an administrator's access token and a role holding any of the
 * permissions. Put on every *-admin.controller.ts with the permission of its
 * area; without arguments any signed-in administrator passes (only for
 * `admin/auth/me`, which every role needs).
 */
export const AdminAuth = (...permissions: AdminPermission[]) =>
  applyDecorators(
    SetMetadata(ADMIN_PERMISSIONS_KEY, permissions),
    UseGuards(AdminAuthGuard),
    ApiBearerAuth(ADMIN_AUTH),
    ApiUnauthorizedResponse(),
    ApiForbiddenResponse(),
  );

/** Replaces the controller's permissions on one route, e.g. to let another role read it. */
export const AdminPermissions = (...permissions: [AdminPermission, ...AdminPermission[]]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);

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
