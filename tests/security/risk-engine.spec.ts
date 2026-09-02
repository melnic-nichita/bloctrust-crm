import { describe, expect, it } from 'vitest';
import { evaluateInvoiceRisk } from '../../apps/api/src/risk/risk-engine.js';

const policy = {
  ruleVersion: 7,
  mediumThreshold: 30,
  highThreshold: 70,
  changedBankAccountScore: 70,
  duplicateHashScore: 70,
  duplicateInvoiceNumberScore: 35,
  contractLimitScore: 50,
  amountSpikeScore: 25,
};

describe('versioned explainable invoice risk rules', () => {
  it('freezes a changed bank account at the configured high-risk score', () => {
    const result = evaluateInvoiceRisk(
      '00000000-0000-4000-8000-000000000001',
      {
        bankAccountVersion: 2,
        exactDocumentDuplicate: false,
        duplicateInvoiceNumber: false,
        totalAmount: '100.00',
        contractValueLimit: '500.00',
        priorInvoiceAverage: '100.00',
      },
      policy,
    );

    expect(result.level).toBe('HIGH');
    expect(result.totalScore).toBe(70);
    expect(result.contributions).toEqual([
      expect.objectContaining({ rule: 'VENDOR_BANK_ACCOUNT_CHANGED', score: 70 }),
    ]);
  });

  it('reproduces the same evidence hash from the stored rule version and facts', () => {
    const facts = {
      bankAccountVersion: 1,
      exactDocumentDuplicate: true,
      duplicateInvoiceNumber: true,
      totalAmount: '250.00',
      contractValueLimit: '200.00',
      priorInvoiceAverage: '100.00',
    } as const;
    const first = evaluateInvoiceRisk('00000000-0000-4000-8000-000000000002', facts, policy);
    const second = evaluateInvoiceRisk('00000000-0000-4000-8000-000000000002', facts, policy);

    expect(first).toEqual(second);
    expect(first.evidenceHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.contributions.map((item) => item.rule)).toEqual([
      'EXACT_DOCUMENT_DUPLICATE',
      'DUPLICATE_INVOICE_NUMBER',
      'CONTRACT_VALUE_LIMIT_EXCEEDED',
      'AMOUNT_SPIKE',
    ]);
  });
});
