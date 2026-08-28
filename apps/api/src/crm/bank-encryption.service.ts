import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

type PlainBankAccount = Readonly<{
  accountNumber: string;
  accountHolder: string;
  bankName?: string;
}>;

type StoredBankAccount = Readonly<{
  encryptedAccount: string;
  encryptionIv: string;
  encryptionTag: string;
  encryptionKeyId: string;
}>;

const GCM_IV_LENGTH_BYTES = 12;
const GCM_AUTH_TAG_LENGTH_BYTES = 16;

@Injectable()
export class BankEncryptionService {
  private readonly keyId: string;
  private readonly encryptionKey: Buffer;
  private readonly fingerprintKey: Buffer;

  constructor() {
    const secret = process.env.FIELD_ENCRYPTION_KEY;
    this.keyId = process.env.FIELD_ENCRYPTION_KEY_ID ?? 'local-v1';

    if (!secret || secret.length < 32) {
      throw new Error('FIELD_ENCRYPTION_KEY must contain at least 32 characters.');
    }

    const masterKey = createHash('sha256').update(secret, 'utf8').digest();
    this.encryptionKey = Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        Buffer.from('bloctrust-crm'),
        Buffer.from('bank-encryption'),
        32,
      ),
    );
    this.fingerprintKey = Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        Buffer.from('bloctrust-crm'),
        Buffer.from('bank-fingerprint'),
        32,
      ),
    );
  }

  encrypt(organizationId: string, vendorId: string, account: PlainBankAccount) {
    const accountNumber = this.normalizeAccount(account.accountNumber);
    const plaintext = Buffer.from(
      JSON.stringify({
        accountNumber,
        accountHolder: account.accountHolder.trim(),
        ...(account.bankName ? { bankName: account.bankName.trim() } : {}),
      }),
      'utf8',
    );
    const iv = randomBytes(GCM_IV_LENGTH_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv, {
      authTagLength: GCM_AUTH_TAG_LENGTH_BYTES,
    });
    cipher.setAAD(this.aad(organizationId, vendorId));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      encryptedAccount: encrypted.toString('base64'),
      encryptionIv: iv.toString('base64'),
      encryptionTag: cipher.getAuthTag().toString('base64'),
      encryptionKeyId: this.keyId,
      accountFingerprint: createHmac('sha256', this.fingerprintKey)
        .update(`${organizationId}:${accountNumber}`)
        .digest('hex'),
      maskedAccount: this.maskAccount(accountNumber),
      maskedAccountHolder: this.maskHolder(account.accountHolder),
    };
  }

  decrypt(organizationId: string, vendorId: string, stored: StoredBankAccount): PlainBankAccount {
    if (stored.encryptionKeyId !== this.keyId) {
      throw new InternalServerErrorException({
        type: 'about:blank',
        title: 'The bank-account encryption key is unavailable',
        status: 500,
        code: 'FIELD_KEY_UNAVAILABLE',
      });
    }

    try {
      const iv = Buffer.from(stored.encryptionIv, 'base64');
      const authenticationTag = Buffer.from(stored.encryptionTag, 'base64');

      if (
        iv.length !== GCM_IV_LENGTH_BYTES ||
        authenticationTag.length !== GCM_AUTH_TAG_LENGTH_BYTES
      ) {
        throw new Error('Invalid AES-GCM parameters.');
      }

      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv, {
        authTagLength: GCM_AUTH_TAG_LENGTH_BYTES,
      });
      decipher.setAAD(this.aad(organizationId, vendorId));
      decipher.setAuthTag(authenticationTag);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(stored.encryptedAccount, 'base64')),
        decipher.final(),
      ]).toString('utf8');

      return JSON.parse(decrypted) as PlainBankAccount;
    } catch {
      throw new InternalServerErrorException({
        type: 'about:blank',
        title: 'The bank-account data failed authenticated decryption',
        status: 500,
        code: 'FIELD_DECRYPTION_FAILED',
      });
    }
  }

  private aad(organizationId: string, vendorId: string): Buffer {
    return Buffer.from(`bloctrust:bank:v1:${organizationId}:${vendorId}`, 'utf8');
  }

  private normalizeAccount(value: string): string {
    return value.replace(/[ -]/gu, '').toUpperCase();
  }

  private maskAccount(value: string): string {
    const first = value.slice(0, Math.min(2, Math.max(0, value.length - 4)));
    return `${first}${'•'.repeat(Math.max(4, Math.min(10, value.length - first.length - 4)))}${value.slice(-4)}`;
  }

  private maskHolder(value: string): string {
    return value
      .trim()
      .split(/\s+/u)
      .map((part) => `${part.slice(0, 1)}${'•'.repeat(Math.max(2, part.length - 1))}`)
      .join(' ');
  }
}
