import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../risk/risk-engine.js';

export type FakeBankPayload = Readonly<{
  eventId: string;
  organizationId: string;
  vendorId: string;
  bankAccountVersionId: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}>;

export function signFakeBankWebhook(
  payload: FakeBankPayload,
  timestamp: string,
  secret: string,
): string {
  return `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.${canonicalJson(payload)}`)
    .digest('hex')}`;
}

export function verifyFakeBankWebhook(
  payload: FakeBankPayload,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: string,
  now = Date.now(),
  maximumAgeSeconds = 300,
): boolean {
  if (!timestamp || !signature || !/^\d{10}$/u.test(timestamp)) return false;
  const age = Math.abs(Math.floor(now / 1_000) - Number(timestamp));
  if (!Number.isSafeInteger(age) || age > maximumAgeSeconds) return false;
  const expected = signFakeBankWebhook(payload, timestamp, secret);
  const suppliedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}
