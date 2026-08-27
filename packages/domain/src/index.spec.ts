import { describe, expect, it } from 'vitest';
import { canTransitionInvoice } from './index.js';

describe('invoice state machine', () => {
  it('forbids direct upload-to-approval transitions', () => {
    expect(canTransitionInvoice('UPLOADED', 'APPROVED')).toBe(false);
  });

  it('allows a blocked result only from scanning', () => {
    expect(canTransitionInvoice('SCANNING', 'BLOCKED')).toBe(true);
    expect(canTransitionInvoice('NEEDS_REVIEW', 'BLOCKED')).toBe(false);
  });

  it('invalidates awaiting approval by returning to review', () => {
    expect(canTransitionInvoice('AWAITING_APPROVAL', 'NEEDS_REVIEW')).toBe(true);
  });
});
