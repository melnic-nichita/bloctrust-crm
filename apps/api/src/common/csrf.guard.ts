import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CsrfService } from './csrf.service.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    this.csrf.assertRequest(context.switchToHttp().getRequest<Request>());
    return true;
  }
}
