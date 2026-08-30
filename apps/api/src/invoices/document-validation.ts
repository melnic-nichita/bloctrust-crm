import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const MAX_INVOICE_BYTES = 15 * 1024 * 1024;

const allowedTypes = new Map([
  ['application/pdf', ['.pdf']],
  ['image/png', ['.png']],
  ['image/jpeg', ['.jpg', '.jpeg']],
]);

export type ValidatedDocument = Readonly<{
  detectedMimeType: string;
  sha256: string;
  sizeBytes: number;
}>;

export function validateFilename(filename: string): void {
  const normalized = filename.normalize('NFKC').toLowerCase();
  const suffixes = normalized.match(/\.[a-z0-9]+/gu) ?? [];

  if (filename.length > 255 || filename.includes('\0') || suffixes.length !== 1) {
    throw invalidDocument('DOCUMENT_FILENAME_REJECTED');
  }

  const allowed = [...allowedTypes.values()].flat();
  if (!allowed.some((suffix) => normalized.endsWith(suffix))) {
    throw invalidDocument('DOCUMENT_EXTENSION_REJECTED');
  }
}

export async function validateDocumentFile(
  path: string,
  filename: string,
  declaredMimeType: string,
  reportedSize?: number,
): Promise<ValidatedDocument> {
  validateFilename(filename);
  if (reportedSize !== undefined && reportedSize > MAX_INVOICE_BYTES) {
    throw new PayloadTooLargeException({ code: 'DOCUMENT_TOO_LARGE' });
  }

  const hash = createHash('sha256');
  const signature = Buffer.alloc(16);
  let signatureLength = 0;
  let sizeBytes = 0;

  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    sizeBytes += bytes.length;
    if (sizeBytes > MAX_INVOICE_BYTES) {
      throw new PayloadTooLargeException({ code: 'DOCUMENT_TOO_LARGE' });
    }
    if (signatureLength < signature.length) {
      const copied = bytes.copy(signature, signatureLength, 0, signature.length - signatureLength);
      signatureLength += copied;
    }
    hash.update(bytes);
  }

  if (sizeBytes === 0) throw invalidDocument('DOCUMENT_EMPTY');
  const detectedMimeType = detectMimeType(signature.subarray(0, signatureLength));
  const extensions = allowedTypes.get(detectedMimeType);
  const normalizedName = filename.toLowerCase();

  if (!extensions || declaredMimeType.toLowerCase() !== detectedMimeType) {
    throw invalidDocument('DOCUMENT_MIME_SIGNATURE_MISMATCH');
  }
  if (!extensions.some((extension) => normalizedName.endsWith(extension))) {
    throw invalidDocument('DOCUMENT_EXTENSION_SIGNATURE_MISMATCH');
  }

  return { detectedMimeType, sha256: hash.digest('hex'), sizeBytes };
}

export function detectMimeType(signature: Uint8Array): string {
  const bytes = Buffer.from(signature);
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'application/octet-stream';
}

function invalidDocument(code: string): BadRequestException {
  return new BadRequestException({ code, title: 'Document was rejected' });
}
