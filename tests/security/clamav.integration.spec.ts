import { describe, expect, it } from 'vitest';
import { scanBytes } from '../../apps/worker/src/clamav.js';

const enabled = process.env.RUN_CLAMAV_INTEGRATION === 'true';

describe.skipIf(!enabled)('ClamAV malware gate', () => {
  it('blocks the standard harmless antivirus test signature', async () => {
    // Fragmented so source scanners do not quarantine this test itself. Keep it in memory so host
    // antivirus software cannot quarantine it before ClamAV receives the INSTREAM request.
    const harmlessTestSignature = [
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
      'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!',
      '$H+H*',
    ].join('');
    await expect(scanBytes(Buffer.from(harmlessTestSignature))).resolves.toEqual({
      clean: false,
      detail: 'MALWARE_FOUND',
    });
  });
});
