import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../roles.enum';
import { ROLE_PERMISSIONS, Permission } from '../permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: Role };

    if (!user?.role) throw new ForbiddenException('Insufficient permissions');

    const allowed = requiredRoles.some((r) => r === user.role);
    if (!allowed) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: Role };

    if (!user?.role) throw new ForbiddenException('Insufficient permissions');

    const userPerms = ROLE_PERMISSIONS[user.role] ?? [];
    const allowed = required.every((p) => userPerms.includes(p));
    if (!allowed) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}
