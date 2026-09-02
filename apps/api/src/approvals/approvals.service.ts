import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { writeAudit } from '../crm/audit.js';
import type { DatabaseTransaction } from '../database/prisma.service.js';
import { TenantDatabaseService } from '../database/tenant-database.service.js';
import {
  ApprovalDecisionOutcome,
  ApprovalRequestStatus,
  InvoiceStatus,
  MembershipRole,
  MembershipStatus,
} from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthContext } from '../identity/auth-context.js';
import { evaluateInvoiceRisk, type InvoiceRiskFacts } from '../risk/risk-engine.js';
import type { ApprovalDecisionDto, SubmitInvoiceDto, UpdateRiskPolicyDto } from './dto.js';

const APPROVER_ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMINISTRATOR,
  MembershipRole.ACCOUNTANT,
];

@Injectable()
export class ApprovalsService {
  private readonly stepUpTtlMilliseconds = Number(process.env.STEP_UP_TTL_SECONDS ?? 300) * 1_000;

  constructor(private readonly database: TenantDatabaseService) {}

  submit(
    auth: AuthContext,
    invoiceId: string,
    dto: SubmitInvoiceDto,
    idempotencyKey: string | undefined,
  ) {
    const keyHash = idempotencyKeyHash(idempotencyKey);
    return this.database.run(auth.organizationId, async (transaction) => {
      const replay = await transaction.approvalRequest.findFirst({
        where: { organizationId: auth.organizationId, idempotencyKeyHash: keyHash },
        include: requestInclude,
      });
      if (replay) {
        if (replay.invoiceId !== invoiceId) throw idempotencyConflict();
        return approvalView(replay, []);
      }

      const invoice = await transaction.invoice.findFirst({
        where: { id: invoiceId, organizationId: auth.organizationId },
        include: {
          contract: { select: { valueLimit: true } },
          documents: {
            select: {
              sha256: true,
              duplicateOfDocumentId: true,
              storageState: true,
              processing: { select: { scanResult: true } },
            },
          },
        },
      });
      if (!invoice) throw notFound();
      if (invoice.version !== dto.version) throw staleInvoice();
      if (invoice.status !== InvoiceStatus.NEEDS_REVIEW) {
        throw new ConflictException({ code: 'INVOICE_NOT_READY_FOR_SUBMISSION' });
      }
      if (
        !invoice.vendorId ||
        !invoice.invoiceNumber ||
        !invoice.currency ||
        invoice.totalAmount === null ||
        invoice.documents.length === 0 ||
        invoice.documents.some(
          (document) =>
            document.storageState !== 'APPROVED' || document.processing?.scanResult !== 'CLEAN',
        )
      ) {
        throw new UnprocessableEntityException({ code: 'INVOICE_REVIEW_INCOMPLETE' });
      }

      const policy = await this.policy(transaction, auth.organizationId);
      const bankAccount = await transaction.vendorBankAccountVersion.findFirst({
        where: { organizationId: auth.organizationId, vendorId: invoice.vendorId },
        orderBy: { versionNumber: 'desc' },
      });
      if (!bankAccount) {
        throw new UnprocessableEntityException({ code: 'VENDOR_BANK_ACCOUNT_REQUIRED' });
      }
      const duplicateInvoiceNumber =
        (await transaction.invoice.count({
          where: {
            organizationId: auth.organizationId,
            vendorId: invoice.vendorId,
            invoiceNumber: { equals: invoice.invoiceNumber, mode: 'insensitive' },
            id: { not: invoice.id },
          },
        })) > 0;
      const previousAmounts = await transaction.invoice.findMany({
        where: {
          organizationId: auth.organizationId,
          vendorId: invoice.vendorId,
          id: { not: invoice.id },
          totalAmount: { not: null },
        },
        select: { totalAmount: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
      });
      const priorInvoiceAverage = average(
        previousAmounts.flatMap((item) =>
          item.totalAmount === null ? [] : [Number(item.totalAmount.toString())],
        ),
      );
      const facts: InvoiceRiskFacts = {
        bankAccountVersion: bankAccount.versionNumber,
        exactDocumentDuplicate: invoice.documents.some(
          (document) => document.duplicateOfDocumentId !== null,
        ),
        duplicateInvoiceNumber,
        totalAmount: invoice.totalAmount.toString(),
        contractValueLimit: invoice.contract?.valueLimit?.toString() ?? null,
        priorInvoiceAverage,
      };
      const evaluation = evaluateInvoiceRisk(invoice.id, facts, policy);
      const nextInvoiceVersion = invoice.version + 1;
      const latestRequest = await transaction.approvalRequest.findFirst({
        where: { organizationId: auth.organizationId, invoiceId },
        select: { version: true },
        orderBy: { version: 'desc' },
      });
      const requestVersion = (latestRequest?.version ?? 0) + 1;
      const risk = await transaction.riskAssessment.create({
        data: {
          organizationId: auth.organizationId,
          invoiceId,
          invoiceVersion: nextInvoiceVersion,
          ruleVersion: evaluation.ruleVersion,
          facts: { ...evaluation.facts },
          contributions: evaluation.contributions.map((item) => ({ ...item })),
          totalScore: evaluation.totalScore,
          level: evaluation.level,
          evidenceHash: evaluation.evidenceHash,
        },
      });
      const request = await transaction.approvalRequest.create({
        data: {
          organizationId: auth.organizationId,
          invoiceId,
          invoiceVersion: nextInvoiceVersion,
          riskAssessmentId: risk.id,
          vendorBankAccountVersionId: bankAccount.id,
          version: requestVersion,
          requiredDecisions: evaluation.level === 'HIGH' ? 2 : 1,
          initiatedByMembershipId: auth.membershipId,
          idempotencyKeyHash: keyHash,
        },
        include: requestInclude,
      });
      const moved = await transaction.invoice.updateMany({
        where: {
          id: invoiceId,
          organizationId: auth.organizationId,
          version: dto.version,
          status: InvoiceStatus.NEEDS_REVIEW,
        },
        data: {
          status: InvoiceStatus.AWAITING_APPROVAL,
          vendorBankAccountVersionId: bankAccount.id,
          version: { increment: 1 },
        },
      });
      if (moved.count !== 1) throw staleInvoice();
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'INVOICE_RISK_ASSESSED',
        entityType: 'INVOICE',
        entityId: invoiceId,
        after: {
          invoiceVersion: nextInvoiceVersion,
          ruleVersion: evaluation.ruleVersion,
          score: evaluation.totalScore,
          level: evaluation.level,
          evidenceHash: evaluation.evidenceHash,
        },
      });
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'APPROVAL_REQUEST_CREATED',
        entityType: 'APPROVAL_REQUEST',
        entityId: request.id,
        after: {
          invoiceId,
          invoiceVersion: nextInvoiceVersion,
          approvalVersion: request.version,
          requiredDecisions: request.requiredDecisions,
        },
      });
      const eligible = await this.eligibleApprovers(transaction, auth.organizationId, request);
      return approvalView(request, eligible);
    });
  }

  list(auth: AuthContext) {
    return this.database.run(auth.organizationId, async (transaction) => {
      const requests = await transaction.approvalRequest.findMany({
        where: { organizationId: auth.organizationId },
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const views = [];
      for (const request of requests) {
        const eligible = await this.eligibleApprovers(transaction, auth.organizationId, request);
        views.push(approvalView(request, eligible));
      }
      return views;
    });
  }

  get(auth: AuthContext, requestId: string) {
    return this.database.run(auth.organizationId, async (transaction) => {
      const request = await transaction.approvalRequest.findFirst({
        where: { id: requestId, organizationId: auth.organizationId },
        include: requestInclude,
      });
      if (!request) throw approvalNotFound();
      const eligible = await this.eligibleApprovers(transaction, auth.organizationId, request);
      return approvalView(request, eligible);
    });
  }

  async decide(
    auth: AuthContext,
    requestId: string,
    dto: ApprovalDecisionDto,
    idempotencyKey: string | undefined,
  ) {
    const keyHash = idempotencyKeyHash(idempotencyKey);
    const result = await this.database.run(auth.organizationId, async (transaction) => {
      const replay = await transaction.approvalDecision.findFirst({
        where: { organizationId: auth.organizationId, idempotencyKeyHash: keyHash },
        include: { approvalRequest: { include: requestInclude } },
      });
      if (replay) {
        if (replay.approvalRequestId !== requestId) throw idempotencyConflict();
        return { stale: false as const, value: approvalView(replay.approvalRequest, []) };
      }
      const request = await transaction.approvalRequest.findFirst({
        where: { id: requestId, organizationId: auth.organizationId },
        include: requestInclude,
      });
      if (!request) throw approvalNotFound();
      if (request.status !== ApprovalRequestStatus.PENDING) {
        throw new ConflictException({ code: 'APPROVAL_REQUEST_NOT_PENDING' });
      }
      if (request.version !== dto.approvalVersion) throw staleApproval();
      if (
        request.invoice.version !== request.invoiceVersion ||
        request.invoice.status !== InvoiceStatus.AWAITING_APPROVAL
      ) {
        await this.invalidate(transaction, request, 'INVOICE_VERSION_CHANGED');
        return { stale: true as const };
      }
      if (request.invoice.vendorId) {
        const latestBankAccount = await transaction.vendorBankAccountVersion.findFirst({
          where: {
            organizationId: auth.organizationId,
            vendorId: request.invoice.vendorId,
          },
          select: { id: true },
          orderBy: { versionNumber: 'desc' },
        });
        if (latestBankAccount?.id !== request.vendorBankAccountVersionId) {
          await this.invalidate(transaction, request, 'VENDOR_BANK_ACCOUNT_CHANGED');
          return { stale: true as const };
        }
      }

      const membership = await transaction.membership.findFirst({
        where: {
          id: auth.membershipId,
          organizationId: auth.organizationId,
          userId: auth.userId,
          status: MembershipStatus.ACTIVE,
          role: { in: APPROVER_ROLES },
        },
      });
      if (!membership) throw approvalForbidden('APPROVER_NOT_ELIGIBLE');
      const policy = await this.policy(transaction, auth.organizationId);
      if (policy.requireSeparationOfDuties && request.initiatedByMembershipId === membership.id) {
        throw approvalForbidden('SELF_APPROVAL_FORBIDDEN');
      }

      const stepUpAfter = new Date(Date.now() - this.stepUpTtlMilliseconds);
      const session = await transaction.session.findFirst({
        where: {
          id: auth.sessionId,
          organizationId: auth.organizationId,
          userId: auth.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          stepUpVerifiedAt: { gte: stepUpAfter },
        },
        select: { id: true, stepUpVerifiedAt: true },
      });
      if (!session?.stepUpVerifiedAt) throw approvalForbidden('PASSKEY_STEP_UP_REQUIRED');

      try {
        await transaction.approvalDecision.create({
          data: {
            organizationId: auth.organizationId,
            approvalRequestId: request.id,
            approvalVersion: request.version,
            decidedByMembershipId: membership.id,
            sessionId: session.id,
            outcome: dto.outcome,
            reason: dto.reason.trim(),
            stepUpVerifiedAt: session.stepUpVerifiedAt,
            idempotencyKeyHash: keyHash,
          },
        });
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw new ConflictException({ code: 'DUPLICATE_APPROVAL_DECISION' });
        }
        throw error;
      }

      if (dto.outcome === 'REJECT') {
        await transaction.approvalRequest.update({
          where: { id: request.id },
          data: { status: ApprovalRequestStatus.REJECTED, completedAt: new Date() },
        });
        await transaction.invoice.update({
          where: { id: request.invoiceId },
          data: { status: InvoiceStatus.REJECTED },
        });
      } else {
        const approvals = await transaction.approvalDecision.count({
          where: {
            organizationId: auth.organizationId,
            approvalRequestId: request.id,
            approvalVersion: request.version,
            outcome: ApprovalDecisionOutcome.APPROVE,
          },
        });
        if (approvals >= request.requiredDecisions) {
          await transaction.approvalRequest.update({
            where: { id: request.id },
            data: { status: ApprovalRequestStatus.APPROVED, completedAt: new Date() },
          });
          await transaction.invoice.update({
            where: { id: request.invoiceId },
            data: { status: InvoiceStatus.APPROVED },
          });
        }
      }
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action:
          dto.outcome === 'APPROVE' ? 'APPROVAL_DECISION_APPROVED' : 'APPROVAL_DECISION_REJECTED',
        entityType: 'APPROVAL_REQUEST',
        entityId: request.id,
        reason: dto.reason,
        after: {
          approvalVersion: request.version,
          invoiceId: request.invoiceId,
          passkeyVerifiedAt: session.stepUpVerifiedAt.toISOString(),
        },
      });
      const updated = await transaction.approvalRequest.findFirstOrThrow({
        where: { id: request.id, organizationId: auth.organizationId },
        include: requestInclude,
      });
      const eligible = await this.eligibleApprovers(transaction, auth.organizationId, updated);
      return { stale: false as const, value: approvalView(updated, eligible) };
    });
    if (result.stale) throw staleApproval();
    return result.value;
  }

  getPolicy(auth: AuthContext) {
    return this.database.run(auth.organizationId, (transaction) =>
      this.policy(transaction, auth.organizationId),
    );
  }

  updatePolicy(auth: AuthContext, dto: UpdateRiskPolicyDto) {
    return this.database.run(auth.organizationId, async (transaction) => {
      const existing = await this.policy(transaction, auth.organizationId);
      const mediumThreshold = dto.mediumThreshold ?? existing.mediumThreshold;
      const highThreshold = dto.highThreshold ?? existing.highThreshold;
      if (mediumThreshold >= highThreshold) {
        throw new UnprocessableEntityException({ code: 'RISK_THRESHOLDS_INVALID' });
      }
      const updated = await transaction.organizationRiskPolicy.update({
        where: { organizationId: auth.organizationId },
        data: { ...dto, ruleVersion: { increment: 1 } },
      });
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'RISK_POLICY_UPDATED',
        entityType: 'RISK_POLICY',
        entityId: updated.id,
        before: policyAudit(existing),
        after: policyAudit(updated),
      });
      return updated;
    });
  }

  private async policy(transaction: DatabaseTransaction, organizationId: string) {
    const existing = await transaction.organizationRiskPolicy.findUnique({
      where: { organizationId },
    });
    return (
      existing ??
      transaction.organizationRiskPolicy.create({
        data: { organizationId },
      })
    );
  }

  private async eligibleApprovers(
    transaction: DatabaseTransaction,
    organizationId: string,
    request: { initiatedByMembershipId: string },
  ) {
    const policy = await this.policy(transaction, organizationId);
    return transaction.membership.findMany({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        role: { in: APPROVER_ROLES },
        ...(policy.requireSeparationOfDuties
          ? { id: { not: request.initiatedByMembershipId } }
          : {}),
      },
      select: { id: true, role: true, user: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async invalidate(
    transaction: DatabaseTransaction,
    request: { id: string; invoiceId: string; invoiceVersion: number },
    reason: string,
  ): Promise<void> {
    await transaction.approvalRequest.updateMany({
      where: { id: request.id, status: ApprovalRequestStatus.PENDING },
      data: { status: ApprovalRequestStatus.INVALIDATED, invalidatedReason: reason },
    });
    await transaction.invoice.updateMany({
      where: {
        id: request.invoiceId,
        version: request.invoiceVersion,
        status: InvoiceStatus.AWAITING_APPROVAL,
      },
      data: { status: InvoiceStatus.NEEDS_REVIEW, version: { increment: 1 } },
    });
  }
}

const requestInclude = {
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      currency: true,
      status: true,
      version: true,
      vendorId: true,
    },
  },
  riskAssessment: true,
  initiatedByMembership: { select: { id: true, user: { select: { displayName: true } } } },
  decisions: {
    select: {
      id: true,
      outcome: true,
      reason: true,
      stepUpVerifiedAt: true,
      createdAt: true,
      decidedByMembership: { select: { id: true, user: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type ApprovalRequestWithDetails = Prisma.ApprovalRequestGetPayload<{
  include: typeof requestInclude;
}>;

function approvalView(request: ApprovalRequestWithDetails, eligibleApprovers: unknown[]) {
  return {
    ...request,
    riskAssessment: {
      ...request.riskAssessment,
      facts: request.riskAssessment.facts,
      contributions: request.riskAssessment.contributions,
    },
    eligibleApprovers,
  };
}

function policyAudit(policy: {
  ruleVersion: number;
  mediumThreshold: number;
  highThreshold: number;
  changedBankAccountScore: number;
  duplicateHashScore: number;
  duplicateInvoiceNumberScore: number;
  contractLimitScore: number;
  amountSpikeScore: number;
}) {
  return { ...policy };
}

function average(values: number[]): string | null {
  if (values.length === 0) return null;
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
}

function idempotencyKeyHash(key: string | undefined): string {
  const normalized = key?.trim();
  if (!normalized || normalized.length < 16 || normalized.length > 200) {
    throw new UnprocessableEntityException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  return createHash('sha256').update(normalized).digest('hex');
}

function isUniqueConstraint(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'INVOICE_NOT_FOUND' });
}

function approvalNotFound(): NotFoundException {
  return new NotFoundException({ code: 'APPROVAL_REQUEST_NOT_FOUND' });
}

function staleInvoice(): ConflictException {
  return new ConflictException({ code: 'STALE_INVOICE_VERSION' });
}

function staleApproval(): ConflictException {
  return new ConflictException({ code: 'STALE_APPROVAL_VERSION' });
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
}

function approvalForbidden(code: string): ForbiddenException {
  return new ForbiddenException({ code });
}
