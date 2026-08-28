import { describe, expect, it } from 'vitest';
import { StepUpGuard } from '../../apps/api/src/identity/step-up.guard.js';

function contextWith(verifiedAt: Date | null) {
  return {
    getHandler: () => function sensitiveAction() {},
    getClass: () => class SensitiveController {},
    switchToHttp: () => ({
      getRequest: () => ({ auth: { stepUpVerifiedAt: verifiedAt } }),
    }),
  };
}

describe('recent step-up regression', () => {
  const reflector = { getAllAndOverride: () => true };
  const guard = new StepUpGuard(reflector as never);

  it('allows a recent server-side passkey timestamp', () => {
    expect(guard.canActivate(contextWith(new Date()) as never)).toBe(true);
  });

  it('rejects an expired server-side passkey timestamp', () => {
    const expired = new Date(Date.now() - 6 * 60 * 1_000);

    expect(() => guard.canActivate(contextWith(expired) as never)).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'STEP_UP_REQUIRED' }) }),
    );
  });
});
