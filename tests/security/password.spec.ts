import { describe, expect, it } from 'vitest';
import { PasswordService } from '../../apps/api/src/identity/password.service.js';

describe('Argon2id password regression', () => {
  it('encodes Argon2id parameters and verifies only the correct password', async () => {
    const passwords = new PasswordService();
    const encoded = await passwords.hash('synthetic correct password');

    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=1\$/u);
    await expect(passwords.verify('synthetic correct password', encoded)).resolves.toBe(true);
    await expect(passwords.verify('synthetic wrong password', encoded)).resolves.toBe(false);
  });

  it('rejects attacker-controlled resource parameters before deriving a key', async () => {
    const passwords = new PasswordService();
    const salt = Buffer.alloc(16).toString('base64').replace(/=+$/u, '');
    const hash = Buffer.alloc(32).toString('base64').replace(/=+$/u, '');
    const encoded = `$argon2id$v=19$m=999999999,t=2,p=1$${salt}$${hash}`;

    await expect(passwords.verify('synthetic password', encoded)).resolves.toBe(false);
  });
});
