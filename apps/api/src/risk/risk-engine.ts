import { createHash } from 'node:crypto';

export type RiskLevelName = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskPolicySnapshot = Readonly<{
  ruleVersion: number;
  mediumThreshold: number;
  highThreshold: number;
  changedBankAccountScore: number;
  duplicateHashScore: number;
  duplicateInvoiceNumberScore: number;
  contractLimitScore: number;
  amountSpikeScore: number;
}>;

export type InvoiceRiskFacts = Readonly<{
  bankAccountVersion: number | null;
  exactDocumentDuplicate: boolean;
  duplicateInvoiceNumber: boolean;
  totalAmount: string | null;
  contractValueLimit: string | null;
  priorInvoiceAverage: string | null;
}>;

export type RiskContribution = Readonly<{
  rule: string;
  score: number;
  explanation: string;
  evidence: string;
}>;

export type RiskEvaluation = Readonly<{
  ruleVersion: number;
  facts: InvoiceRiskFacts;
  contributions: RiskContribution[];
  totalScore: number;
  level: RiskLevelName;
  evidenceHash: string;
}>;

export function evaluateInvoiceRisk(
  invoiceId: string,
  facts: InvoiceRiskFacts,
  policy: RiskPolicySnapshot,
): RiskEvaluation {
  const contributions: RiskContribution[] = [];
  if ((facts.bankAccountVersion ?? 0) > 1) {
    contributions.push({
      rule: 'VENDOR_BANK_ACCOUNT_CHANGED',
      score: policy.changedBankAccountScore,
      explanation: `Vendor bank account version ${facts.bankAccountVersion} is newer than the original account.`,
      evidence: `/api/v1/invoices/${invoiceId}/risk/evidence/vendor-bank-history`,
    });
  }
  if (facts.exactDocumentDuplicate) {
    contributions.push({
      rule: 'EXACT_DOCUMENT_DUPLICATE',
      score: policy.duplicateHashScore,
      explanation:
        'The approved source document matches an earlier tenant-scoped SHA-256 fingerprint.',
      evidence: `/api/v1/invoices/${invoiceId}/risk/evidence/document-fingerprint`,
    });
  }
  if (facts.duplicateInvoiceNumber) {
    contributions.push({
      rule: 'DUPLICATE_INVOICE_NUMBER',
      score: policy.duplicateInvoiceNumberScore,
      explanation: 'The vendor has another invoice with the same normalized invoice number.',
      evidence: `/api/v1/invoices/${invoiceId}/risk/evidence/invoice-number`,
    });
  }

  const total = decimal(facts.totalAmount);
  const contractLimit = decimal(facts.contractValueLimit);
  if (total !== null && contractLimit !== null && total > contractLimit) {
    contributions.push({
      rule: 'CONTRACT_VALUE_LIMIT_EXCEEDED',
      score: policy.contractLimitScore,
      explanation: `Invoice total ${facts.totalAmount} exceeds the contract limit ${facts.contractValueLimit}.`,
      evidence: `/api/v1/invoices/${invoiceId}/risk/evidence/contract`,
    });
  }

  const priorAverage = decimal(facts.priorInvoiceAverage);
  if (total !== null && priorAverage !== null && priorAverage > 0 && total >= priorAverage * 2) {
    contributions.push({
      rule: 'AMOUNT_SPIKE',
      score: policy.amountSpikeScore,
      explanation: `Invoice total is at least twice the vendor's prior invoice average of ${facts.priorInvoiceAverage}.`,
      evidence: `/api/v1/invoices/${invoiceId}/risk/evidence/vendor-amount-history`,
    });
  }

  const totalScore = contributions.reduce((sum, contribution) => sum + contribution.score, 0);
  const level: RiskLevelName =
    totalScore >= policy.highThreshold
      ? 'HIGH'
      : totalScore >= policy.mediumThreshold
        ? 'MEDIUM'
        : 'LOW';
  const evidenceHash = createHash('sha256')
    .update(
      canonicalJson({
        invoiceId,
        ruleVersion: policy.ruleVersion,
        facts,
        contributions,
        totalScore,
        level,
      }),
    )
    .digest('hex');
  return { ruleVersion: policy.ruleVersion, facts, contributions, totalScore, level, evidenceHash };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function decimal(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
