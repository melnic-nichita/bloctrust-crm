import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';

@Injectable()
export class PwnedPasswordService {
  async exposureCount(password: string): Promise<number> {
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    const endpoint = process.env.HIBP_PASSWORDS_URL ?? 'https://api.pwnedpasswords.com/range';

    try {
      const response = await fetch(`${endpoint}/${prefix}`, {
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'BlocTrust-CRM-password-screening',
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) throw new Error(`HIBP returned ${response.status}`);

      const matchingLine = (await response.text())
        .split('\n')
        .find((line) => line.startsWith(`${suffix}:`));

      if (!matchingLine) return 0;

      return Number(matchingLine.split(':')[1]?.trim() ?? 0);
    } catch {
      throw new ServiceUnavailableException({
        type: 'about:blank',
        title: 'Password exposure screening is temporarily unavailable',
        status: 503,
        code: 'PASSWORD_SCREENING_UNAVAILABLE',
      });
    }
  }
}
