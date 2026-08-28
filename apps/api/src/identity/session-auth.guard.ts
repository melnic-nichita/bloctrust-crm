import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { cookieNames, readCookies } from '../common/cookies.js';
import { PUBLIC_ROUTE } from '../common/public.decorator.js';
import type { OptionallyAuthenticatedRequest } from './authenticated-request.js';
import { SessionService } from './session.service.js';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<OptionallyAuthenticatedRequest>();
    const accessToken = readCookies(request)[cookieNames.access];

    if (!accessToken) {
      if (isPublic) return true;
      throw this.authenticationRequired();
    }

    try {
      request.auth = await this.sessions.authenticateAccessToken(accessToken);
      return true;
    } catch (error) {
      if (isPublic) return true;
      throw error;
    }
  }

  private authenticationRequired(): UnauthorizedException {
    return new UnauthorizedException({
      type: 'about:blank',
      title: 'Authentication is required',
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });
  }
}
