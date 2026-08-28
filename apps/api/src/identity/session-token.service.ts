import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

type AccessTokenPayload = Readonly<{
  version: 1;
  sessionId: string;
  userId: string;
  organizationId: string;
  expiresAt: number;
}>;

@Injectable()
export class SessionTokenService {
  private readonly signingKey: string;

  constructor() {
    this.signingKey =
      process.env.SESSION_SIGNING_KEY ?? 'development_only_replace_with_32_random_bytes';

    if (this.signingKey.length < 32) {
      throw new Error('SESSION_SIGNING_KEY must contain at least 32 characters.');
    }
  }

  createOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  signAccessToken(payload: AccessTokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.sign(encodedPayload);

    return `v1.${encodedPayload}.${signature}`;
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const [version, encodedPayload, suppliedSignature, extra] = token.split('.');

    if (version !== 'v1' || !encodedPayload || !suppliedSignature || extra) {
      throw this.invalidToken();
    }

    const expectedSignature = this.sign(encodedPayload);
    if (!this.equal(expectedSignature, suppliedSignature)) throw this.invalidToken();

    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<AccessTokenPayload>;

      if (
        payload.version !== 1 ||
        typeof payload.sessionId !== 'string' ||
        typeof payload.userId !== 'string' ||
        typeof payload.organizationId !== 'string' ||
        typeof payload.expiresAt !== 'number' ||
        payload.expiresAt <= Date.now()
      ) {
        throw this.invalidToken();
      }

      return payload as AccessTokenPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw this.invalidToken();
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.signingKey).update(value, 'utf8').digest('base64url');
  }

  private equal(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException({
      type: 'about:blank',
      title: 'The access session is invalid or expired',
      status: 401,
      code: 'ACCESS_SESSION_INVALID',
    });
  }
}
