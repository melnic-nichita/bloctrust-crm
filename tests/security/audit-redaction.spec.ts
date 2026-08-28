import { describe, expect, it } from 'vitest';
import {
  contractAuditShape,
  redactAuditReason,
  vendorAuditShape,
} from '../../apps/api/src/crm/audit.js';

describe('CRM audit redaction', () => {
  it('redacts vendor PII and internal notes from before/after snapshots', () => {
    const audit = vendorAuditShape({
      id: 'vendor-id',
      legalName: 'Synthetic Vendor',
      tradingName: null,
      registrationNumber: 'REG-1',
      status: 'ACTIVE',
      tags: ['lift'],
      version: 2,
    });

    expect(audit.contactDetails).toBe('[REDACTED]');
    expect(audit.internalNotes).toBe('[REDACTED]');
    expect(JSON.stringify(audit)).not.toContain('bank');
  });

  it('does not persist the contract document locator in snapshots', () => {
    const audit = contractAuditShape({
      id: 'contract-id',
      vendorId: 'vendor-id',
      reference: 'C-1',
      title: 'Maintenance',
      serviceCategory: 'Lift',
      valueLimit: { toString: () => '100.00' },
      currency: 'MDL',
      startsOn: new Date('2026-01-01T00:00:00.000Z'),
      endsOn: null,
      status: 'ACTIVE',
      documentReference: 's3://secret-location',
      version: 1,
    });

    expect(audit.documentReference).toBe('[REFERENCE_REDACTED]');
  });

  it('removes account-like values from human-entered audit reasons', () => {
    expect(redactAuditReason('Confirmed MD24AG000000000000000001 by callback')).toBe(
      'Confirmed [REDACTED_ACCOUNT] by callback',
    );
  });
});
