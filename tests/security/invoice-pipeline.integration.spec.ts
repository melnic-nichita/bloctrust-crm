import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../apps/api/src/database/prisma.service.js';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service.js';
import { MembershipRole } from '../../apps/api/src/generated/prisma/client.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('Milestone 0.4 invoice tenant boundary', () => {
  const prisma = new PrismaService();
  const database = new TenantDatabaseService(prisma);
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const invoiceA = randomUUID();
  const invoiceB = randomUUID();
  const documentA = randomUUID();
  const documentB = randomUUID();
  const fingerprint = 'a'.repeat(64);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        { id: userA, email: `${userA}@example.test`, displayName: 'Invoice A' },
        { id: userB, email: `${userB}@example.test`, displayName: 'Invoice B' },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: organizationA, slug: `invoice-a-${organizationA}`, name: 'Invoice A' },
        { id: organizationB, slug: `invoice-b-${organizationB}`, name: 'Invoice B' },
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
    await prisma.invoice.createMany({
      data: [
        { id: invoiceA, organizationId: organizationA, createdByMembershipId: membershipA },
        { id: invoiceB, organizationId: organizationB, createdByMembershipId: membershipB },
      ],
    });
    await prisma.document.createMany({
      data: [
        {
          id: documentA,
          organizationId: organizationA,
          invoiceId: invoiceA,
          originalFilename: 'first-name.pdf',
          declaredMimeType: 'application/pdf',
          detectedMimeType: 'application/pdf',
          sizeBytes: 128,
          quarantineObjectKey: `${randomUUID()}/${randomUUID()}`,
          sha256: fingerprint,
          createdByMembershipId: membershipA,
        },
        {
          id: documentB,
          organizationId: organizationB,
          invoiceId: invoiceB,
          originalFilename: 'renamed.pdf',
          declaredMimeType: 'application/pdf',
          detectedMimeType: 'application/pdf',
          sizeBytes: 128,
          quarantineObjectKey: `${randomUUID()}/${randomUUID()}`,
          sha256: fingerprint,
          createdByMembershipId: membershipB,
        },
      ],
    });
    await prisma.documentProcessing.createMany({
      data: [
        {
          organizationId: organizationA,
          documentId: documentA,
          suggestions: { totalAmount: '100.00' },
        },
        { organizationId: organizationB, documentId: documentB },
      ],
    });
  });

  afterAll(async () => {
    await prisma.documentProcessing.deleteMany({
      where: { organizationId: { in: [organizationA, organizationB] } },
    });
    await prisma.document.deleteMany({
      where: { organizationId: { in: [organizationA, organizationB] } },
    });
    await prisma.invoice.deleteMany({
      where: { organizationId: { in: [organizationA, organizationB] } },
    });
    await prisma.membership.deleteMany({
      where: { organizationId: { in: [organizationA, organizationB] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationA, organizationB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('does not reveal whether a cross-tenant invoice or document identifier exists', async () => {
    const result = await database.run(organizationA, async (transaction) => ({
      invoice: await transaction.invoice.findFirst({ where: { id: invoiceB } }),
      document: await transaction.document.findFirst({ where: { id: documentB } }),
    }));
    expect(result).toEqual({ invoice: null, document: null });
  });

  it('keeps OCR suggestions separate from financial draft fields', async () => {
    const visible = await database.run(organizationA, (transaction) =>
      transaction.invoice.findFirstOrThrow({
        where: { id: invoiceA },
        include: { documents: { include: { processing: true } } },
      }),
    );
    expect(visible.totalAmount).toBeNull();
    expect(visible.documents[0]?.processing?.suggestions).toEqual({ totalAmount: '100.00' });
  });

  it('matches fingerprints independently of client filenames without crossing tenants', async () => {
    const matches = await database.run(organizationA, (transaction) =>
      transaction.document.findMany({
        where: { sha256: fingerprint },
        select: { id: true, originalFilename: true },
      }),
    );
    expect(matches).toEqual([{ id: documentA, originalFilename: 'first-name.pdf' }]);
  });
});
