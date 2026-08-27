export const invoiceStates = [
  'UPLOADED',
  'QUARANTINED',
  'SCANNING',
  'PARSED',
  'NEEDS_REVIEW',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'BLOCKED',
  'MANUAL_REVIEW',
] as const;

export type InvoiceState = (typeof invoiceStates)[number];

const allowedTransitions: Readonly<Record<InvoiceState, readonly InvoiceState[]>> = {
  UPLOADED: ['QUARANTINED'],
  QUARANTINED: ['SCANNING'],
  SCANNING: ['PARSED', 'BLOCKED', 'MANUAL_REVIEW'],
  PARSED: ['NEEDS_REVIEW', 'MANUAL_REVIEW'],
  NEEDS_REVIEW: ['AWAITING_APPROVAL', 'REJECTED'],
  AWAITING_APPROVAL: ['APPROVED', 'REJECTED', 'NEEDS_REVIEW'],
  APPROVED: [],
  REJECTED: [],
  BLOCKED: [],
  MANUAL_REVIEW: ['NEEDS_REVIEW', 'REJECTED'],
};

export function canTransitionInvoice(from: InvoiceState, to: InvoiceState): boolean {
  return allowedTransitions[from].includes(to);
}

export type DomainEvent<TType extends string, TPayload> = Readonly<{
  id: string;
  type: TType;
  occurredAt: string;
  organizationId: string;
  correlationId: string;
  causationId?: string;
  payload: Readonly<TPayload>;
}>;
