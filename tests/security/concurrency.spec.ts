import { describe, expect, it } from 'vitest';
import { expectedVersion, staleWrite } from '../../apps/api/src/crm/concurrency.js';

describe('optimistic concurrency contract', () => {
  it('accepts strong and weak entity tags', () => {
    expect(expectedVersion('"7"')).toBe(7);
    expect(expectedVersion('W/"9"')).toBe(9);
  });

  it('requires a positive entity version and returns a conflict for stale data', () => {
    try {
      expectedVersion(undefined);
      throw new Error('Expected a missing entity version to fail.');
    } catch (error) {
      expect((error as { getResponse(): object }).getResponse()).toMatchObject({
        code: 'ENTITY_VERSION_REQUIRED',
      });
    }
    expect(staleWrite().getStatus()).toBe(409);
  });
});
