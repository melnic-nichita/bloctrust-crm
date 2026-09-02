import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApprovalsService } from '../../apps/api/src/approvals/approvals.service.js';
import { PrismaService } from '../../apps/api/src/database/prisma.service.js';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service.js';
import {
  DocumentProcessingState,
  DocumentScanResult,
  DocumentStorageState,
  InvoiceStatus,
  MembershipRole,
  VendorStatus,
} from '../../apps/api/src/generated/prisma/client.js';
import { FakeBankService } from '../../apps/api/src/integrations/fake-bank.service.js';
import { signFakeBankWebhook } from '../../apps/api/src/integrations/fake-bank-webhook.js';
import type { AuthContext } from '../../apps/api/src/identity/auth-context.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('Milestone 0.5 approval abuse boundaries', () => {
  const prisma = new PrismaService();
  const tenantDatabase = new TenantDatabaseService(prisma);
  const approvals = new ApprovalsService(tenantDatabase);
  const fakeBank = new FakeBankService(tenantDatabase);
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const initiatorUserId = randomUUID();
  const approverOneUserId = randomUUID();
  const approverTwoUserId = randomUUID();
  const otherUserId = randomUUID();
  const initiatorMembershipId = randomUUID();
  const approverOneMembershipId = randomUUID();
  const approverTwoMembershipId = randomUUID();
  const otherMembershipId = randomUUID();
  const initiatorSessionId = randomUUID();
  const approverOneSessionId = randomUUID();
  const approverTwoSessionId = randomUUID();
  const vendorId = randomUUID();
  const bankVersionOneId = randomUUID();
  const bankVersionTwoId = randomUUID();
  const invoiceId = randomUUID();
  const documentId = randomUUID();
  const recentStepUp = new Date();
  let firstRequestId = '';

  const auth = (
    userId: string,
    membershipId: string,
    sessionId: string,
    stepUpVerifiedAt: Date | null,
  ): AuthContext => ({
    userId,
    membershipId,
    sessionId,
    organizationId,
    role: MembershipRole.ACCOUNTANT,
    authenticatedAt: new Date(),
    stepUpVerifiedAt,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        { id: initiatorUserId, email: `${initiatorUserId}@example.test`, displayName: 'Initiator' },
        {
          id: approverOneUserId,
          email: `${approverOneUserId}@example.test`,
          displayName: 'Approver One',
        },
        {
          id: approverTwoUserId,
          email: `${approverTwoUserId}@example.test`,
          displayName: 'Approver Two',
        },
        { id: otherUserId, email: `${otherUserId}@example.test`, displayName: 'Other Tenant' },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: organizationId, slug: `approval-${organizationId}`, name: 'Approval Tenant' },
        { id: otherOrganizationId, slug: `approval-${otherOrganizationId}`, name: 'Other Tenant' },
      ],
    });
    await prisma.membership.createMany({
      data: [
        {
          id: initiatorMembershipId,
          organizationId,
          userId: initiatorUserId,
          role: MembershipRole.ACCOUNTANT,
        },
        {
          id: approverOneMembershipId,
          organizationId,
          userId: approverOneUserId,
          role: MembershipRole.ACCOUNTANT,
        },
        {
          id: approverTwoMembershipId,
          organizationId,
          userId: approverTwoUserId,
          role: MembershipRole.ACCOUNTANT,
        },
        {
          id: otherMembershipId,
          organizationId: otherOrganizationId,
          userId: otherUserId,
          role: MembershipRole.OWNER,
        },
      ],
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000);
    await prisma.session.createMany({
      data: [
        {
          id: initiatorSessionId,
          userId: initiatorUserId,
          organizationId,
          tokenFamilyId: randomUUID(),
          refreshTokenHash: randomUUID(),
          csrfTokenHash: randomUUID(),
          stepUpVerifiedAt: recentStepUp,
          expiresAt,
        },
        {
          id: approverOneSessionId,
          userId: approverOneUserId,
          organizationId,
          tokenFamilyId: randomUUID(),
          refreshTokenHash: randomUUID(),
          csrfTokenHash: randomUUID(),
          expiresAt,
        },
        {
          id: approverTwoSessionId,
          userId: approverTwoUserId,
          organizationId,
          tokenFamilyId: randomUUID(),
          refreshTokenHash: randomUUID(),
          csrfTokenHash: randomUUID(),
          stepUpVerifiedAt: recentStepUp,
          expiresAt,
        },
      ],
    });
    await prisma.vendor.create({
      data: {
        id: vendorId,
        organizationId,
        legalName: 'Synthetic Utility Vendor',
        status: VendorStatus.ACTIVE,
        tags: [],
      },
    });
    await prisma.vendorBankAccountVersion.createMany({
      data: [
        bankVersion(bankVersionOneId, 1, 'fingerprint-one'),
        bankVersion(bankVersionTwoId, 2, 'fingerprint-two'),
      ],
    });
    await prisma.invoice.create({
      data: {
        id: invoiceId,
        organizationId,
        vendorId,
        invoiceNumber: `RISK-${invoiceId}`,
        currency: 'MDL',
        totalAmount: 250,
        status: InvoiceStatus.NEEDS_REVIEW,
        createdByMembershipId: initiatorMembershipId,
      },
    });
    await prisma.document.create({
      data: {
        id: documentId,
        organizationId,
        invoiceId,
        originalFilename: 'synthetic-invoice.pdf',
        declaredMimeType: 'application/pdf',
        detectedMimeType: 'application/pdf',
        sizeBytes: 128,
        quarantineObjectKey: `${randomUUID()}/${randomUUID()}`,
        approvedObjectKey: `${randomUUID()}/${randomUUID()}`,
        sha256: 'a'.repeat(64),
        storageState: DocumentStorageState.APPROVED,
        createdByMembershipId: initiatorMembershipId,
      },
    });
    await prisma.documentProcessing.create({
      data: {
        organizationId,
        documentId,
        state: DocumentProcessingState.NEEDS_REVIEW,
        progress: 100,
        scanResult: DocumentScanResult.CLEAN,
      },
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('app.allow_immutable_purge', 'true', true)`;
      await transaction.fakeBankWebhookDelivery.deleteMany({ where: { organizationId } });
      await transaction.approvalDecision.deleteMany({ where: { organizationId } });
      await transaction.approvalRequest.deleteMany({ where: { organizationId } });
      await transaction.riskAssessment.deleteMany({ where: { organizationId } });
      await transaction.organizationRiskPolicy.deleteMany({ where: { organizationId } });
      await transaction.auditEvent.deleteMany({ where: { organizationId } });
      await transaction.documentProcessing.deleteMany({ where: { organizationId } });
      await transaction.document.deleteMany({ where: { organizationId } });
      await transaction.invoice.deleteMany({ where: { organizationId } });
      await transaction.vendorBankAccountVerification.deleteMany({ where: { organizationId } });
      await transaction.vendorBankAccountVersion.deleteMany({ where: { organizationId } });
      await transaction.vendor.deleteMany({ where: { organizationId } });
      await transaction.session.deleteMany({ where: { organizationId } });
      await transaction.membership.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrganizationId] } },
      });
      await transaction.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrganizationId] } },
      });
      await transaction.user.deleteMany({
        where: { id: { in: [initiatorUserId, approverOneUserId, approverTwoUserId, otherUserId] } },
      });
    });
    await prisma.$disconnect();
  });

  it('scores a changed bank account as high risk and blocks self-approval', async () => {
    const request = await approvals.submit(
      auth(initiatorUserId, initiatorMembershipId, initiatorSessionId, recentStepUp),
      invoiceId,
      { version: 1 },
      randomUUID(),
    );
    firstRequestId = request.id;
    expect(request.riskAssessment.level).toBe('HIGH');
    expect(request.requiredDecisions).toBe(2);
    await expect(
      approvals.decide(
        auth(initiatorUserId, initiatorMembershipId, initiatorSessionId, recentStepUp),
        request.id,
        { approvalVersion: request.version, outcome: 'APPROVE', reason: 'Attempted self approval' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'SELF_APPROVAL_FORBIDDEN' } });
  });

  it('rejects stale approval versions and forged step-up claims', async () => {
    const request = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: firstRequestId },
    });
    const forged = auth(
      approverOneUserId,
      approverOneMembershipId,
      approverOneSessionId,
      new Date(),
    );
    await expect(
      approvals.decide(
        forged,
        request.id,
        {
          approvalVersion: request.version + 1,
          outcome: 'APPROVE',
          reason: 'Wrong approval version',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'STALE_APPROVAL_VERSION' } });
    await expect(
      approvals.decide(
        forged,
        request.id,
        {
          approvalVersion: request.version,
          outcome: 'APPROVE',
          reason: 'Forged context timestamp',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'PASSKEY_STEP_UP_REQUIRED' } });
  });

  it('keeps approval session evidence tenant-scoped at the database layer', async () => {
    await expect(
      tenantDatabase.run(otherOrganizationId, (transaction) =>
        transaction.session.findFirst({
          where: { id: approverOneSessionId },
          select: { id: true },
        }),
      ),
    ).resolves.toBeNull();
  });

  it('deduplicates decisions, invalidates edited evidence, and requires a fresh approval version', async () => {
    await prisma.session.update({
      where: { id: approverOneSessionId },
      data: { stepUpVerifiedAt: new Date() },
    });
    const request = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: firstRequestId },
    });
    const approverOne = auth(
      approverOneUserId,
      approverOneMembershipId,
      approverOneSessionId,
      new Date(),
    );
    const replayKey = randomUUID();
    await approvals.decide(
      approverOne,
      request.id,
      {
        approvalVersion: request.version,
        outcome: 'APPROVE',
        reason: 'Evidence reviewed by first approver',
      },
      replayKey,
    );
    await approvals.decide(
      approverOne,
      request.id,
      {
        approvalVersion: request.version,
        outcome: 'APPROVE',
        reason: 'Evidence reviewed by first approver',
      },
      replayKey,
    );
    expect(await prisma.approvalDecision.count({ where: { approvalRequestId: request.id } })).toBe(
      1,
    );
    await expect(
      approvals.decide(
        approverOne,
        request.id,
        {
          approvalVersion: request.version,
          outcome: 'APPROVE',
          reason: 'Duplicate human decision',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'DUPLICATE_APPROVAL_DECISION' } });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.NEEDS_REVIEW, version: { increment: 1 } },
    });
    await expect(
      approvals.decide(
        auth(approverTwoUserId, approverTwoMembershipId, approverTwoSessionId, recentStepUp),
        request.id,
        { approvalVersion: request.version, outcome: 'APPROVE', reason: 'Stale second decision' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'STALE_APPROVAL_VERSION' } });
    await expect(
      prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).resolves.toMatchObject({ status: 'INVALIDATED' });

    const currentInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const fresh = await approvals.submit(
      auth(initiatorUserId, initiatorMembershipId, initiatorSessionId, recentStepUp),
      invoiceId,
      { version: currentInvoice.version },
      randomUUID(),
    );
    expect(fresh.version).toBe(2);
    await approvals.decide(
      approverOne,
      fresh.id,
      {
        approvalVersion: fresh.version,
        outcome: 'APPROVE',
        reason: 'Fresh evidence first approval',
      },
      randomUUID(),
    );
    await approvals.decide(
      auth(approverTwoUserId, approverTwoMembershipId, approverTwoSessionId, recentStepUp),
      fresh.id,
      {
        approvalVersion: fresh.version,
        outcome: 'APPROVE',
        reason: 'Fresh evidence second approval',
      },
      randomUUID(),
    );
    await expect(
      prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).resolves.toMatchObject({
      status: InvoiceStatus.APPROVED,
    });
  });

  it('processes a signed fake-bank webhook only once', async () => {
    process.env.FAKE_BANK_WEBHOOK_SECRET = 'synthetic_fake_bank_webhook_secret_32_bytes';
    const payload = {
      eventId: randomUUID(),
      organizationId,
      vendorId,
      bankAccountVersionId: bankVersionTwoId,
      status: 'VERIFIED' as const,
    };
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = signFakeBankWebhook(payload, timestamp, process.env.FAKE_BANK_WEBHOOK_SECRET);
    await expect(fakeBank.process(payload, timestamp, signature)).resolves.toEqual({
      accepted: true,
      duplicate: false,
      stateTransitioned: true,
    });
    await expect(fakeBank.process(payload, timestamp, signature)).resolves.toEqual({
      accepted: true,
      duplicate: true,
      stateTransitioned: false,
    });
    expect(
      await prisma.fakeBankWebhookDelivery.count({
        where: { organizationId, eventId: payload.eventId },
      }),
    ).toBe(1);
    await expect(
      prisma.fakeBankWebhookDelivery.update({
        where: { organizationId_eventId: { organizationId, eventId: payload.eventId } },
        data: { status: 'REJECTED' },
      }),
    ).rejects.toThrow('append-only');
    await expect(
      prisma.fakeBankWebhookDelivery.findUniqueOrThrow({
        where: { organizationId_eventId: { organizationId, eventId: payload.eventId } },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'VERIFIED' });
  });

  function bankVersion(id: string, versionNumber: number, fingerprint: string) {
    return {
      id,
      organizationId,
      vendorId,
      versionNumber,
      countryCode: 'MD',
      encryptedAccount: Buffer.from(`synthetic-${versionNumber}`).toString('base64'),
      encryptionIv: Buffer.alloc(12, versionNumber).toString('base64'),
      encryptionTag: Buffer.alloc(16, versionNumber).toString('base64'),
      encryptionKeyId: 'integration-v1',
      accountFingerprint: fingerprint,
      maskedAccount: `MD••••${versionNumber.toString().padStart(4, '0')}`,
      maskedAccountHolder: 'Synthetic Vendor',
      createdByMembershipId: initiatorMembershipId,
    };
  }
});
