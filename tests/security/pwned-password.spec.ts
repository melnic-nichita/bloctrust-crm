import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PwnedPasswordService } from '../../apps/api/src/identity/pwned-password.service.js';

describe('Pwned Passwords privacy regression', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the five-character SHA-1 prefix and requests padded responses', async () => {
    const password = 'synthetic-password-not-a-secret';
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    const fetchMock = vi.fn(async () =>
      Promise.resolve(new Response(`${digest.slice(5)}:7\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0`)),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(new PwnedPasswordService().exposureCount(password)).resolves.toBe(7);
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toMatch(new RegExp(`/${digest.slice(0, 5)}$`, 'u'));
    expect(String(url)).not.toContain(password);
    expect((init as RequestInit).headers).toMatchObject({ 'Add-Padding': 'true' });
  });
});
