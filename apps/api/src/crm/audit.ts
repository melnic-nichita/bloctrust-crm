import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '../database/prisma.service.js';

type AuditInput = Readonly<{
  organizationId: string;
  actorMembershipId: string;
  action: string;
  entityType: 'VENDOR' | 'CONTRACT' | 'BANK_ACCOUNT';
  entityId: string;
  before?: object;
  after?: object;
  reason?: string;
}>;

export function writeAudit(transaction: DatabaseTransaction, input: AuditInput) {
  return transaction.auditEvent.create({
    data: {
      ...input,
      correlationId: randomUUID(),
    },
  });
}

export function vendorAuditShape(vendor: {
  id: string;
  legalName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  status: string;
  tags: string[];
  version: number;
}) {
  return {
    id: vendor.id,
    legalName: vendor.legalName,
    tradingName: vendor.tradingName,
    registrationNumber: vendor.registrationNumber,
    status: vendor.status,
    tags: vendor.tags,
    version: vendor.version,
    contactDetails: '[REDACTED]',
    taxId: '[REDACTED]',
    internalNotes: '[REDACTED]',
  };
}

export function contractAuditShape(contract: {
  id: string;
  vendorId: string;
  reference: string;
  title: string;
  serviceCategory: string;
  valueLimit: { toString(): string } | null;
  currency: string | null;
  startsOn: Date;
  endsOn: Date | null;
  status: string;
  documentReference: string | null;
  version: number;
}) {
  return {
    id: contract.id,
    vendorId: contract.vendorId,
    reference: contract.reference,
    title: contract.title,
    serviceCategory: contract.serviceCategory,
    valueLimit: contract.valueLimit?.toString() ?? null,
    currency: contract.currency,
    startsOn: contract.startsOn.toISOString().slice(0, 10),
    endsOn: contract.endsOn?.toISOString().slice(0, 10) ?? null,
    status: contract.status,
    documentReference: contract.documentReference ? '[REFERENCE_REDACTED]' : null,
    version: contract.version,
  };
}

export function redactAuditReason(reason: string | undefined): string | undefined {
  return reason
    ?.replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}[A-Z0-9]{0,2}\b/giu, '[REDACTED_ACCOUNT]')
    .replace(/\b\d{8,}\b/gu, '[REDACTED_NUMBER]')
    .trim();
}
