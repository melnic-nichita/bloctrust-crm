import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { REQUIRED_ROLES } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<MembershipRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (roles.includes(auth.role)) return true;

    throw new ForbiddenException({
      type: 'about:blank',
      title: 'Your server-side membership role cannot perform this action',
      status: 403,
      code: 'ROLE_FORBIDDEN',
    });
  }
}
