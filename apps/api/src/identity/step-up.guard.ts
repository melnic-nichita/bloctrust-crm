import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { STEP_UP_REQUIRED } from './step-up.decorator.js';

@Injectable()
export class StepUpGuard implements CanActivate {
  private readonly maximumAge = Number(process.env.STEP_UP_TTL_SECONDS ?? 300) * 1_000;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(STEP_UP_REQUIRED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { stepUpVerifiedAt } = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    const recent = stepUpVerifiedAt && Date.now() - stepUpVerifiedAt.getTime() <= this.maximumAge;

    if (recent) return true;

    throw new ForbiddenException({
      type: 'about:blank',
      title: 'Recent passkey verification is required',
      status: 403,
      code: 'STEP_UP_REQUIRED',
    });
  }
}
