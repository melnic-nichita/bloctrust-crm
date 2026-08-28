import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../apps/api/src/database/prisma.service.js';
import { MembershipRole } from '../../apps/api/src/generated/prisma/client.js';
import { SessionService } from '../../apps/api/src/identity/session.service.js';
import { SessionTokenService } from '../../apps/api/src/identity/session-token.service.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('refresh token replay regression', () => {
  const prisma = new PrismaService();
  const sessions = new SessionService(prisma, new SessionTokenService());
  const organizationId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.test`, displayName: 'Replay Test User' },
    });
    await prisma.organization.create({
      data: { id: organizationId, slug: `replay-${organizationId}`, name: 'Replay Test' },
    });
    await prisma.membership.create({
      data: { organizationId, userId, role: MembershipRole.OWNER },
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('revokes the complete token family when a consumed token is replayed', async () => {
    const original = await sessions.create(userId, organizationId, {});
    const rotated = await sessions.rotate(original.refreshToken, {});

    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    await expect(sessions.rotate(original.refreshToken, {})).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REUSED' },
    });

    const storedSession = await prisma.session.findUniqueOrThrow({
      where: { id: original.sessionId },
    });
    const activeTokens = await prisma.sessionRefreshToken.count({
      where: { sessionId: original.sessionId, revokedAt: null },
    });

    expect(storedSession.revokedAt).toBeInstanceOf(Date);
    expect(activeTokens).toBe(0);
  });
});
