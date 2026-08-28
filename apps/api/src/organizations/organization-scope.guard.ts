import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../identity/authenticated-request.js';

@Injectable()
export class OrganizationScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requestedOrganizationId = request.params.organizationId;

    if (!requestedOrganizationId || requestedOrganizationId !== request.auth.organizationId) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Organization was not found',
        status: 404,
        code: 'ORGANIZATION_NOT_FOUND',
      });
    }

    return true;
  }
}
