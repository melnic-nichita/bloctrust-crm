import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_INVOICE_BYTES,
  detectMimeType,
  validateDocumentFile,
  validateFilename,
} from '../../apps/api/src/invoices/document-validation.js';
import { DownloadTokenService } from '../../apps/api/src/invoices/download-token.service.js';
import { canEditInvoiceDraft } from '../../apps/api/src/invoices/invoices.service.js';
import { parseSuggestions } from '../../apps/worker/src/ocr.js';

describe('secure invoice document controls', () => {
  const directories: string[] = [];
  afterEach(async () =>
    Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
  );

  it('recognizes allowed signatures instead of trusting extensions', () => {
    expect(detectMimeType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(detectMimeType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
    expect(detectMimeType(Buffer.from('not-a-pdf'))).toBe('application/octet-stream');
  });

  it('rejects double extensions and MIME/signature disagreement', async () => {
    expect(() => validateFilename('invoice.pdf.exe')).toThrow();
    const directory = await mkdtemp(join(tmpdir(), 'document-validation-'));
    directories.push(directory);
    const file = join(directory, 'upload');
    await writeFile(file, '%PDF-1.7\nsynthetic invoice');
    await expect(validateDocumentFile(file, 'invoice.pdf', 'image/png')).rejects.toThrow();
    await expect(
      validateDocumentFile(file, 'invoice.pdf', 'application/pdf', MAX_INVOICE_BYTES + 1),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('keeps OCR output as suggestions requiring explicit reviewer action', () => {
    expect(parseSuggestions('Invoice: INV-2026-41\nTotal EUR 1,250.00\n2026-08-29')).toMatchObject({
      invoiceNumber: 'INV-2026-41',
      currency: 'EUR',
      issueDate: '2026-08-29',
    });
  });

  it('keeps reviewer edits behind a successful malware scan', () => {
    expect(
      canEditInvoiceDraft('MANUAL_REVIEW', [
        { storageState: 'QUARANTINED', processing: { scanResult: 'ERROR' } },
      ]),
    ).toBe(false);
    expect(
      canEditInvoiceDraft('MANUAL_REVIEW', [
        { storageState: 'APPROVED', processing: { scanResult: 'CLEAN' } },
      ]),
    ).toBe(true);
    expect(
      canEditInvoiceDraft('PROCESSING', [
        { storageState: 'APPROVED', processing: { scanResult: 'CLEAN' } },
      ]),
    ).toBe(false);
  });

  it('binds signed downloads to tenant, document, and expiry', () => {
    process.env.DOWNLOAD_TOKEN_SECRET = 'test-download-secret-with-at-least-32-characters';
    const service = new DownloadTokenService();
    const token = service.issue('document-a', 'tenant-a', 60);
    expect(() => service.verify(token, 'document-a', 'tenant-a')).not.toThrow();
    expect(() => service.verify(token, 'document-a', 'tenant-b')).toThrow();
    expect(() => service.verify(`${token}x`, 'document-a', 'tenant-a')).toThrow();
  });
});
