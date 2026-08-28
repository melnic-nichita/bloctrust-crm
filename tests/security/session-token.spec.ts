import { describe, expect, it } from 'vitest';
import { SessionTokenService } from '../../apps/api/src/identity/session-token.service.js';

describe('signed access session regression', () => {
  const tokens = new SessionTokenService();

  it('rejects a payload whose tenant identifier was forged', () => {
    const valid = tokens.signAccessToken({
      version: 1,
      sessionId: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000011',
      organizationId: '00000000-0000-4000-8000-000000000012',
      expiresAt: Date.now() + 60_000,
    });
    const [, payload, signature] = valid.split('.');
    const decoded = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    decoded.organizationId = '00000000-0000-4000-8000-000000000099';
    const forgedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    expect(() => tokens.verifyAccessToken(`v1.${forgedPayload}.${signature}`)).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'ACCESS_SESSION_INVALID' }),
      }),
    );
  });
});
