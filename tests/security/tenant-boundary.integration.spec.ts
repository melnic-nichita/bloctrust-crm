import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../apps/api/src/database/prisma.service.js';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service.js';
import { MembershipRole } from '../../apps/api/src/generated/prisma/client.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('PostgreSQL tenant boundary', () => {
  const prisma = new PrismaService();
  const tenantDatabase = new TenantDatabaseService(prisma);
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        { id: userA, email: `${userA}@example.test`, displayName: 'Tenant A User' },
        { id: userB, email: `${userB}@example.test`, displayName: 'Tenant B User' },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: organizationA, slug: `tenant-a-${organizationA}`, name: 'Tenant A' },
        { id: organizationB, slug: `tenant-b-${organizationB}`, name: 'Tenant B' },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationA, userId: userA, role: MembershipRole.OWNER },
        { organizationId: organizationB, userId: userB, role: MembershipRole.OWNER },
      ],
    });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({
      where: { organizationId: { in: [organizationA, organizationB] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationA, organizationB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('does not return Tenant B by identifier inside Tenant A context', async () => {
    const attacked = await tenantDatabase.run(organizationA, (transaction) =>
      transaction.organization.findUnique({ where: { id: organizationB } }),
    );

    expect(attacked).toBeNull();
  });

  it('filters accidental unscoped queries at the database layer', async () => {
    const visible = await tenantDatabase.run(organizationA, (transaction) =>
      transaction.organization.findMany({ select: { id: true } }),
    );

    expect(visible).toEqual([{ id: organizationA }]);
  });

  it('blocks a cross-tenant update even when the repository forgets its filter', async () => {
    const result = await tenantDatabase.run(organizationA, (transaction) =>
      transaction.organization.updateMany({
        where: { id: organizationB },
        data: { name: 'Compromised' },
      }),
    );

    expect(result.count).toBe(0);
  });
});
