import type { Request } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';
import { CsrfService } from '../../apps/api/src/common/csrf.service.js';

describe('CSRF and Origin regression', () => {
  const csrf = new CsrfService();

  beforeEach(() => {
    process.env.TRUSTED_ORIGINS = 'http://localhost:3000';
  });

  it('rejects a cookie-authenticated mutation from an untrusted origin', () => {
    const request = {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        cookie: 'bt_access=signed; bt_csrf=known-token',
        'x-csrf-token': 'known-token',
      },
    } as Request;

    expect(() => csrf.assertRequest(request)).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'ORIGIN_NOT_TRUSTED' }),
      }),
    );
  });

  it('rejects a mismatched double-submit token', () => {
    const request = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'bt_access=signed; bt_csrf=cookie-token',
        'x-csrf-token': 'forged-token',
      },
    } as Request;

    expect(() => csrf.assertRequest(request)).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'CSRF_INVALID' }) }),
    );
  });

  it('allows a trusted mutation with matching tokens', () => {
    const request = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'bt_access=signed; bt_csrf=same-token',
        'x-csrf-token': 'same-token',
      },
    } as Request;

    expect(() => csrf.assertRequest(request)).not.toThrow();
  });
});
