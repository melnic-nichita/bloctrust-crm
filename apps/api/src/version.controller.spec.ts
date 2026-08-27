import { describe, expect, it } from 'vitest';
import { VersionController } from './version.controller.js';

describe('VersionController', () => {
  it('returns non-sensitive build metadata', () => {
    const result = new VersionController().getVersion();

    expect(result.name).toBe('bloctrust-api');
    expect(result).not.toHaveProperty('DATABASE_URL');
  });
});
