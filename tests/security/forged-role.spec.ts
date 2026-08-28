import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OnboardOrganizationDto } from '../../apps/api/src/identity/dto.js';

describe('forged role regression', () => {
  it('rejects a client-supplied owner role during onboarding', async () => {
    const pipe = new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    });

    await expect(
      pipe.transform(
        {
          organizationName: 'Synthetic Association',
          organizationSlug: 'synthetic-association',
          displayName: 'Test Owner',
          email: 'owner@example.test',
          password: 'correct horse battery staple',
          role: 'OWNER',
          stepUpVerifiedAt: new Date().toISOString(),
        },
        { type: 'body', metatype: OnboardOrganizationDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
