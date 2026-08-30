import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { scanFile } from './clamav.js';
import { extractSuggestions } from './ocr.js';
import { ObjectStorage } from './object-storage.js';

export type InvoiceIngestJob = Readonly<{
  invoiceId: string;
  documentId: string;
  organizationId: string;
  correlationId: string;
}>;

type DocumentRow = Readonly<{
  id: string;
  invoiceId: string;
  organizationId: string;
  quarantineObjectKey: string;
  approvedObjectKey: string | null;
  detectedMimeType: string;
  storageState: 'QUARANTINED' | 'APPROVED' | 'BLOCKED';
  processingState: string;
}>;

export class InvoicePipeline {
  private readonly database = new Pool({ connectionString: required('DATABASE_URL') });
  private readonly storage = new ObjectStorage();
  private readonly quarantineBucket = process.env.MINIO_QUARANTINE_BUCKET ?? 'bloctrust-quarantine';
  private readonly approvedBucket = process.env.MINIO_APPROVED_BUCKET ?? 'bloctrust-approved';

  async process(job: InvoiceIngestJob, finalAttempt: boolean): Promise<void> {
    const document = await this.load(job);
    if (
      !document ||
      ['NEEDS_REVIEW', 'MANUAL_REVIEW', 'BLOCKED'].includes(document.processingState)
    )
      return;
    const work = await mkdtemp(join(tmpdir(), 'bloctrust-ingest-'));
    const file = join(work, 'document');
    try {
      if (document.storageState === 'QUARANTINED') {
        await this.progress(job, 'SCANNING', 25, { incrementAttempt: true });
        await this.storage.download(this.quarantineBucket, document.quarantineObjectKey, file);
        const scan = await scanFile(file);
        if (!scan.clean) {
          await this.block(job);
          return;
        }
        const metadata = await stat(file);
        const sha256 = await hashFile(file);
        const approvedKey = `${randomUUID()}/${randomUUID()}`;
        await this.storage.put(this.approvedBucket, approvedKey, file, sha256, metadata.size);
        const client = await this.database.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            `${job.organizationId}:${sha256}`,
          ]);
          const duplicate = await client.query<{ id: string }>(
            'SELECT "id" FROM "Document" WHERE "organizationId" = $1 AND "sha256" = $2 AND "id" <> $3 ORDER BY "createdAt" LIMIT 1',
            [job.organizationId, sha256, job.documentId],
          );
          await client.query(
            'UPDATE "Document" SET "approvedObjectKey" = $1, "sha256" = $2, "duplicateOfDocumentId" = $3, "storageState" = \'APPROVED\', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $4 AND "organizationId" = $5',
            [
              approvedKey,
              sha256,
              duplicate.rows[0]?.id ?? null,
              job.documentId,
              job.organizationId,
            ],
          );
          await client.query(
            'UPDATE "DocumentProcessing" SET "state" = \'PARSED\', "progress" = 75, "scanResult" = \'CLEAN\', "lastHeartbeatAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "documentId" = $1 AND "organizationId" = $2',
            [job.documentId, job.organizationId],
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          await this.storage.delete(this.approvedBucket, approvedKey).catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
        await this.storage.delete(this.quarantineBucket, document.quarantineObjectKey);
      } else {
        await this.progress(job, 'PARSED', 75, {
          incrementAttempt: true,
          scanResult: 'CLEAN',
        });
        await this.storage.download(this.approvedBucket, document.approvedObjectKey!, file);
      }

      const ocr = await extractSuggestions(file, document.detectedMimeType);
      const client = await this.database.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE "DocumentProcessing" SET "state" = \'NEEDS_REVIEW\', "progress" = 100, "ocrEngine" = $1, "suggestions" = $2::jsonb, "completedAt" = CURRENT_TIMESTAMP, "lastHeartbeatAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "documentId" = $3 AND "organizationId" = $4',
          [ocr.engine, JSON.stringify(ocr.suggestions), job.documentId, job.organizationId],
        );
        await client.query(
          'UPDATE "Invoice" SET "status" = \'NEEDS_REVIEW\', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "organizationId" = $2',
          [job.invoiceId, job.organizationId],
        );
        await this.audit(client, job, 'INVOICE_OCR_SUGGESTIONS_CREATED', {
          suggestionFields: Object.keys(ocr.suggestions),
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (finalAttempt) {
        await this.manualReview(job, error instanceof Error ? error.name : 'PIPELINE_ERROR');
      } else {
        await this.resetForRetry(job);
      }
      throw error;
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  async close(): Promise<void> {
    await this.database.end();
  }

  private async load(job: InvoiceIngestJob): Promise<DocumentRow | undefined> {
    const result = await this.database.query<DocumentRow>(
      'SELECT d."id", d."invoiceId", d."organizationId", d."quarantineObjectKey", d."approvedObjectKey", d."detectedMimeType", d."storageState", p."state" AS "processingState" FROM "Document" d JOIN "DocumentProcessing" p ON p."documentId" = d."id" AND p."organizationId" = d."organizationId" WHERE d."id" = $1 AND d."invoiceId" = $2 AND d."organizationId" = $3',
      [job.documentId, job.invoiceId, job.organizationId],
    );
    return result.rows[0];
  }

  private async progress(
    job: InvoiceIngestJob,
    state: string,
    progress: number,
    options: { incrementAttempt?: boolean; scanResult?: string } = {},
  ): Promise<void> {
    await this.database.query(
      `UPDATE "DocumentProcessing" SET "state" = $1::"DocumentProcessingState", "progress" = $2, "attempts" = "attempts" + $3, "scanResult" = COALESCE($4::"DocumentScanResult", "scanResult"), "startedAt" = COALESCE("startedAt", CURRENT_TIMESTAMP), "lastHeartbeatAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "documentId" = $5 AND "organizationId" = $6`,
      [
        state,
        progress,
        options.incrementAttempt ? 1 : 0,
        options.scanResult ?? null,
        job.documentId,
        job.organizationId,
      ],
    );
  }

  private async block(job: InvoiceIngestJob): Promise<void> {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE "Document" SET "storageState" = \'BLOCKED\', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "organizationId" = $2',
        [job.documentId, job.organizationId],
      );
      await client.query(
        'UPDATE "DocumentProcessing" SET "state" = \'BLOCKED\', "progress" = 100, "scanResult" = \'INFECTED\', "scanDetail" = \'MALWARE_FOUND\', "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "documentId" = $1 AND "organizationId" = $2',
        [job.documentId, job.organizationId],
      );
      await client.query(
        'UPDATE "Invoice" SET "status" = \'BLOCKED\', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "organizationId" = $2',
        [job.invoiceId, job.organizationId],
      );
      await this.audit(client, job, 'DOCUMENT_BLOCKED', { reason: 'MALWARE_FOUND' });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async manualReview(job: InvoiceIngestJob, errorCode: string): Promise<void> {
    await this.database.query(
      'UPDATE "DocumentProcessing" SET "state" = \'MANUAL_REVIEW\', "progress" = 100, "scanResult" = CASE WHEN "scanResult" = \'PENDING\' THEN \'ERROR\' ELSE "scanResult" END, "errorCode" = $1, "errorMessage" = \'Processing requires operator review\', "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "documentId" = $2 AND "organizationId" = $3 AND "state" NOT IN (\'NEEDS_REVIEW\', \'BLOCKED\')',
      [errorCode.slice(0, 80), job.documentId, job.organizationId],
    );
    await this.database.query(
      'UPDATE "Invoice" SET "status" = \'MANUAL_REVIEW\', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "organizationId" = $2 AND "status" = \'PROCESSING\'',
      [job.invoiceId, job.organizationId],
    );
  }

  private async resetForRetry(job: InvoiceIngestJob): Promise<void> {
    await this.database.query(
      `UPDATE "DocumentProcessing" AS processing SET "state" = CASE WHEN document."storageState" = 'APPROVED' THEN 'PARSED'::"DocumentProcessingState" ELSE 'QUARANTINED'::"DocumentProcessingState" END, "progress" = CASE WHEN document."storageState" = 'APPROVED' THEN 75 ELSE 10 END, "errorCode" = NULL, "errorMessage" = NULL, "lastHeartbeatAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP FROM "Document" AS document WHERE processing."documentId" = document."id" AND processing."organizationId" = document."organizationId" AND processing."documentId" = $1 AND processing."organizationId" = $2`,
      [job.documentId, job.organizationId],
    );
  }

  private audit(
    client: PoolClient,
    job: InvoiceIngestJob,
    action: string,
    after: object,
  ): Promise<unknown> {
    return client.query(
      'INSERT INTO "AuditEvent" ("id", "organizationId", "action", "entityType", "entityId", "after", "correlationId", "createdAt") VALUES ($1, $2, $3, \'DOCUMENT\', $4, $5::jsonb, $6, CURRENT_TIMESTAMP)',
      [
        randomUUID(),
        job.organizationId,
        action,
        job.documentId,
        JSON.stringify(after),
        job.correlationId,
      ],
    );
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
