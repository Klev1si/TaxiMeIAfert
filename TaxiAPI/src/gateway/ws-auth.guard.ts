import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthenticatedSocket } from './events.gateway.js';

/**
 * WsAuthGuard — enforces @Roles() on individual socket event handlers.
 *
 * Usage:
 *   @UseGuards(WsAuthGuard)
 *   @Roles(UserRole.DRIVER)
 *   @SubscribeMessage('gps_update')
 *   handleGps(...) {}
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    if (!client.data?.userId) {
      throw new WsException('Unauthorized');
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → only require valid auth (userId present)
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const hasRole = requiredRoles.some(
      (role) => role === (client.data.role as UserRole),
    );

    if (!hasRole) {
      throw new WsException(
        `Forbidden — requires role: ${requiredRoles.join(' | ')}`,
      );
    }

    return true;
  }
}
