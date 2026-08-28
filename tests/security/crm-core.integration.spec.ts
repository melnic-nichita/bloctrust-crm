import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BankEncryptionService } from '../../apps/api/src/crm/bank-encryption.service.js';
import { BuildingAccessService } from '../../apps/api/src/crm/building-access.service.js';
import { VendorsService } from '../../apps/api/src/crm/vendors.service.js';
import { PrismaService } from '../../apps/api/src/database/prisma.service.js';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service.js';
import { MembershipRole, VendorStatus } from '../../apps/api/src/generated/prisma/client.js';
import type { AuthContext } from '../../apps/api/src/identity/auth-context.js';

const enabled = Boolean(process.env.DATABASE_URL);
process.env.FIELD_ENCRYPTION_KEY ??= 'integration_test_field_key_with_at_least_32_bytes';
process.env.FIELD_ENCRYPTION_KEY_ID ??= 'integration-v1';

describe.skipIf(!enabled)('Milestone 0.3 CRM security boundary', () => {
  const prisma = new PrismaService();
  const tenantDatabase = new TenantDatabaseService(prisma);
  const encryption = new BankEncryptionService();
  const vendors = new VendorsService(tenantDatabase, new BuildingAccessService(), encryption);
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const buildingA = randomUUID();
  const unlinkedBuildingA = randomUUID();
  const buildingB = randomUUID();
  const vendorA = randomUUID();
  const vendorB = randomUUID();
  const contractA = randomUUID();
  const authA: AuthContext = {
    userId: userA,
    membershipId: membershipA,
    sessionId: randomUUID(),
    organizationId: organizationA,
    role: MembershipRole.OWNER,
    authenticatedAt: new Date(),
    stepUpVerifiedAt: new Date(),
  };

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        { id: userA, email: `${userA}@example.test`, displayName: 'CRM Tenant A' },
        { id: userB, email: `${userB}@example.test`, displayName: 'CRM Tenant B' },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: organizationA, slug: `crm-a-${organizationA}`, name: 'CRM Tenant A' },
        { id: organizationB, slug: `crm-b-${organizationB}`, name: 'CRM Tenant B' },
      ],
    });
    await prisma.membership.createMany({
      data: [
        {
          id: membershipA,
          organizationId: organizationA,
          userId: userA,
          role: MembershipRole.OWNER,
        },
        {
          id: membershipB,
          organizationId: organizationB,
          userId: userB,
          role: MembershipRole.OWNER,
        },
      ],
    });
    await prisma.building.createMany({
      data: [
        {
          id: buildingA,
          organizationId: organizationA,
          name: 'Shared Search Name',
          addressLine1: 'A Street',
          city: 'A City',
          postalCode: 'A1',
          countryCode: 'MD',
        },
        {
          id: buildingB,
          organizationId: organizationB,
          name: 'Shared Search Name',
          addressLine1: 'B Street',
          city: 'B City',
          postalCode: 'B1',
          countryCode: 'MD',
        },
        {
          id: unlinkedBuildingA,
          organizationId: organizationA,
          name: 'Unlinked Tenant A Building',
          addressLine1: 'A2 Street',
          city: 'A City',
          postalCode: 'A2',
          countryCode: 'MD',
        },
      ],
    });
    await prisma.vendor.createMany({
      data: [
        {
          id: vendorA,
          organizationId: organizationA,
          legalName: 'Shared Search Vendor',
          status: VendorStatus.ACTIVE,
          tags: [],
        },
        {
          id: vendorB,
          organizationId: organizationB,
          legalName: 'Shared Search Vendor',
          status: VendorStatus.ACTIVE,
          tags: [],
        },
      ],
    });
    await prisma.vendorBuilding.createMany({
      data: [
        { organizationId: organizationA, vendorId: vendorA, buildingId: buildingA },
        { organizationId: organizationB, vendorId: vendorB, buildingId: buildingB },
      ],
    });
    await prisma.contract.create({
      data: {
        id: contractA,
        organizationId: organizationA,
        vendorId: vendorA,
        reference: `CRM-${contractA}`,
        title: 'CRM boundary contract',
        serviceCategory: 'Test service',
        startsOn: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.contractBuilding.create({
      data: {
        organizationId: organizationA,
        contractId: contractA,
        buildingId: buildingA,
      },
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('app.allow_immutable_purge', 'true', true)`;
      await transaction.vendorBankAccountVerification.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.auditEvent.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.vendorBankAccountVersion.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.contractBuilding.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.contract.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.vendorBuilding.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.vendor.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.building.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.membership.deleteMany({
        where: { organizationId: { in: [organizationA, organizationB] } },
      });
      await transaction.organization.deleteMany({
        where: { id: { in: [organizationA, organizationB] } },
      });
      await transaction.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    });
    await prisma.$disconnect();
  });

  it('does not expose cross-tenant records or a cross-tenant total through scoped search', async () => {
    const result = await vendors.list(authA, { q: 'Shared Search', limit: 25 });

    expect(result.data.map((vendor) => vendor.id)).toEqual([vendorA]);
    expect(result.nextCursor).toBeNull();
    expect(result).not.toHaveProperty('total');
  });

  it('blocks a cross-tenant relationship even when organizationId is forged', async () => {
    await expect(
      tenantDatabase.run(organizationA, (transaction) =>
        transaction.vendorBuilding.create({
          data: { organizationId: organizationA, vendorId: vendorA, buildingId: buildingB },
        }),
      ),
    ).rejects.toThrow();
  });

  it('enforces the vendor passport building scope for contracts in PostgreSQL', async () => {
    await expect(
      prisma.contractBuilding.create({
        data: {
          organizationId: organizationA,
          contractId: contractA,
          buildingId: unlinkedBuildingA,
        },
      }),
    ).rejects.toThrow('not authorized');

    await expect(
      prisma.vendorBuilding.delete({
        where: {
          organizationId_vendorId_buildingId: {
            organizationId: organizationA,
            vendorId: vendorA,
            buildingId: buildingA,
          },
        },
      }),
    ).rejects.toThrow('referenced by a contract');
  });

  it('keeps bank versions masked, immutable, and audits the reason for every reveal', async () => {
    const created = await vendors.addBankVersion(authA, vendorA, {
      accountHolder: 'Tenant A Vendor',
      bankName: 'Synthetic Bank',
      countryCode: 'MD',
      accountNumber: 'MD24AG000000000000000001',
    });
    const history = await vendors.bankHistory(authA, vendorA);

    expect(history[0]?.maskedAccount).toMatch(/^MD.*0001$/u);
    expect(history[0]).not.toHaveProperty('encryptedAccount');
    await expect(
      prisma.vendorBankAccountVersion.update({
        where: { id: created.id },
        data: { maskedAccount: 'silently-overwritten' },
      }),
    ).rejects.toThrow('append-only');

    const revealed = await vendors.revealBankVersion(authA, vendorA, created.id, {
      reason: 'Confirming account during integration-test verification',
    });
    expect(revealed.accountNumber).toBe('MD24AG000000000000000001');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        organizationId: organizationA,
        entityId: created.id,
        action: 'BANK_ACCOUNT_REVEALED',
      },
    });
    expect(audit.reason).toContain('integration-test');
    expect(JSON.stringify(audit)).not.toContain('MD24AG000000000000000001');
  });

  it('returns a conflict instead of overwriting a concurrent vendor edit', async () => {
    const first = await vendors.update(authA, vendorA, 1, { tradingName: 'First editor' });
    expect(first.version).toBe(2);
    await expect(
      vendors.update(authA, vendorA, 1, { tradingName: 'Stale editor' }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});
