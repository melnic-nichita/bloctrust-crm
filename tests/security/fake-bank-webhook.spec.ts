import { describe, expect, it } from 'vitest';
import {
  signFakeBankWebhook,
  verifyFakeBankWebhook,
} from '../../apps/api/src/integrations/fake-bank-webhook.js';

const secret = 'synthetic_fake_bank_test_secret_32_bytes';
const payload = {
  eventId: '00000000-0000-4000-8000-000000000010',
  organizationId: '00000000-0000-4000-8000-000000000011',
  vendorId: '00000000-0000-4000-8000-000000000012',
  bankAccountVersionId: '00000000-0000-4000-8000-000000000013',
  status: 'VERIFIED' as const,
};

describe('fake-bank demonstration webhook signature', () => {
  it('accepts a current canonical HMAC and rejects tampering', () => {
    const now = 1_800_000_000_000;
    const timestamp = String(Math.floor(now / 1_000));
    const signature = signFakeBankWebhook(payload, timestamp, secret);

    expect(verifyFakeBankWebhook(payload, timestamp, signature, secret, now)).toBe(true);
    expect(
      verifyFakeBankWebhook({ ...payload, status: 'REJECTED' }, timestamp, signature, secret, now),
    ).toBe(false);
  });

  it('rejects a correctly signed delivery outside the replay window', () => {
    const now = 1_800_000_000_000;
    const timestamp = String(Math.floor(now / 1_000) - 301);
    const signature = signFakeBankWebhook(payload, timestamp, secret);

    expect(verifyFakeBankWebhook(payload, timestamp, signature, secret, now)).toBe(false);
  });
});
