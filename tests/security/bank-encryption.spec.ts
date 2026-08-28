import { beforeEach, describe, expect, it } from 'vitest';
import { BankEncryptionService } from '../../apps/api/src/crm/bank-encryption.service.js';

describe('bank-account field encryption', () => {
  beforeEach(() => {
    process.env.FIELD_ENCRYPTION_KEY = 'test_only_bank_field_key_with_at_least_32_bytes';
    process.env.FIELD_ENCRYPTION_KEY_ID = 'test-v1';
  });

  it('stores authenticated ciphertext and reveals the original fields only through decryption', () => {
    const service = new BankEncryptionService();
    const encrypted = service.encrypt('organization-a', 'vendor-a', {
      accountNumber: 'MD24 AG00 0000 0000 0000 0001',
      accountHolder: 'Synthetic Vendor SRL',
      bankName: 'Synthetic Bank',
    });

    expect(JSON.stringify(encrypted)).not.toContain('MD24AG000000000000000001');
    expect(JSON.stringify(encrypted)).not.toContain('Synthetic Vendor SRL');
    expect(encrypted.maskedAccount).toMatch(/^MD.*0001$/u);
    expect(encrypted.encryptionKeyId).toBe('test-v1');
    expect(service.decrypt('organization-a', 'vendor-a', encrypted)).toEqual({
      accountNumber: 'MD24AG000000000000000001',
      accountHolder: 'Synthetic Vendor SRL',
      bankName: 'Synthetic Bank',
    });
  });

  it('rejects ciphertext moved into another tenant context', () => {
    const service = new BankEncryptionService();
    const encrypted = service.encrypt('organization-a', 'vendor-a', {
      accountNumber: 'MD24AG000000000000000001',
      accountHolder: 'Synthetic Vendor SRL',
    });

    try {
      service.decrypt('organization-b', 'vendor-a', encrypted);
      throw new Error('Expected authenticated decryption to fail.');
    } catch (error) {
      expect((error as { getResponse(): object }).getResponse()).toMatchObject({
        code: 'FIELD_DECRYPTION_FAILED',
      });
    }
  });

  it('rejects a truncated GCM authentication tag', () => {
    const service = new BankEncryptionService();
    const encrypted = service.encrypt('organization-a', 'vendor-a', {
      accountNumber: 'MD24AG000000000000000001',
      accountHolder: 'Synthetic Vendor SRL',
    });
    const truncatedTag = Buffer.from(encrypted.encryptionTag, 'base64')
      .subarray(0, 12)
      .toString('base64');

    try {
      service.decrypt('organization-a', 'vendor-a', {
        ...encrypted,
        encryptionTag: truncatedTag,
      });
      throw new Error('Expected authenticated decryption to fail.');
    } catch (error) {
      expect((error as { getResponse(): object }).getResponse()).toMatchObject({
        code: 'FIELD_DECRYPTION_FAILED',
      });
    }
  });
});
