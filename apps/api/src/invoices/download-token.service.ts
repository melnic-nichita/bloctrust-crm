import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

type DownloadClaim = Readonly<{ documentId: string; organizationId: string; expiresAt: number }>;

@Injectable()
export class DownloadTokenService {
  private readonly secret = process.env.DOWNLOAD_TOKEN_SECRET ?? process.env.SESSION_SIGNING_KEY;

  constructor() {
    if (!this.secret || this.secret.length < 32) {
      throw new Error(
        'DOWNLOAD_TOKEN_SECRET or SESSION_SIGNING_KEY with at least 32 characters is required.',
      );
    }
  }

  issue(documentId: string, organizationId: string, ttlSeconds = 60): string {
    const payload = Buffer.from(
      JSON.stringify({ documentId, organizationId, expiresAt: Date.now() + ttlSeconds * 1000 }),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string | undefined, documentId: string, organizationId: string): void {
    if (!token) throw invalidToken();
    const [payload, suppliedSignature] = token.split('.');
    if (!payload || !suppliedSignature) throw invalidToken();
    const expected = Buffer.from(this.sign(payload));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw invalidToken();

    let claim: DownloadClaim;
    try {
      claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DownloadClaim;
    } catch {
      throw invalidToken();
    }
    if (
      claim.documentId !== documentId ||
      claim.organizationId !== organizationId ||
      claim.expiresAt < Date.now()
    ) {
      throw invalidToken();
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret!).update(payload).digest('base64url');
  }
}

function invalidToken(): UnauthorizedException {
  return new UnauthorizedException({ code: 'DOWNLOAD_TOKEN_INVALID' });
}
