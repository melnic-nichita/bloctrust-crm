import { ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { cookieNames, readCookies } from './cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfService {
  assertRequest(request: Request): void {
    if (SAFE_METHODS.has(request.method.toUpperCase())) return;

    this.assertTrustedOrigin(request);

    const cookies = readCookies(request);
    const isCookieAuthenticated = Boolean(
      cookies[cookieNames.access] ?? cookies[cookieNames.refresh],
    );

    if (!isCookieAuthenticated) return;

    const cookieToken = cookies[cookieNames.csrf];
    const headerValue = request.headers['x-csrf-token'];
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!cookieToken || !headerToken || !this.equal(cookieToken, headerToken)) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'CSRF verification failed',
        status: 403,
        code: 'CSRF_INVALID',
      });
    }
  }

  private assertTrustedOrigin(request: Request): void {
    const origin = request.headers.origin;
    const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim().replace(/\/$/u, ''))
      .filter(Boolean);

    if (!origin || !trustedOrigins.includes(origin.replace(/\/$/u, ''))) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Request origin is not trusted',
        status: 403,
        code: 'ORIGIN_NOT_TRUSTED',
      });
    }
  }

  private equal(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
