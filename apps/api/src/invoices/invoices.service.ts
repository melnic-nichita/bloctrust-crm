import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { DatabaseTransaction } from '../database/prisma.service.js';
import { TenantDatabaseService } from '../database/tenant-database.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { writeAudit } from '../crm/audit.js';
import { validateDocumentFile } from './document-validation.js';
import { DownloadTokenService } from './download-token.service.js';
import type { UpdateInvoiceDraftDto, UploadInvoiceDto } from './dto.js';
import { InvoiceQueueService } from './invoice-queue.service.js';
import { ObjectStorageService } from './object-storage.service.js';

type UploadedFile = Readonly<{
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}>;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly queue: InvoiceQueueService,
    private readonly downloads: DownloadTokenService,
  ) {}

  async upload(auth: AuthContext, dto: UploadInvoiceDto, file: UploadedFile) {
    if (!file) throw new BadRequestException({ code: 'DOCUMENT_FILE_REQUIRED' });
    try {
      const validated = await validateDocumentFile(
        file.path,
        file.originalname,
        file.mimetype,
        file.size,
      );
      const documentId = randomUUID();
      const invoiceId = randomUUID();
      const correlationId = randomUUID();
      const quarantineKey = `${randomUUID()}/${randomUUID()}`;
      await this.storage.putFile(
        process.env.MINIO_QUARANTINE_BUCKET ?? 'bloctrust-quarantine',
        quarantineKey,
        file.path,
        validated.sha256,
        validated.sizeBytes,
      );

      let invoice;
      try {
        invoice = await this.database.run(auth.organizationId, async (transaction) => {
          await this.assertRelationships(transaction, auth.organizationId, dto);
          await transaction.invoice.create({
            data: {
              id: invoiceId,
              organizationId: auth.organizationId,
              ...(dto.vendorId !== undefined ? { vendorId: dto.vendorId } : {}),
              ...(dto.contractId !== undefined ? { contractId: dto.contractId } : {}),
              createdByMembershipId: auth.membershipId,
            },
          });
          await transaction.document.create({
            data: {
              id: documentId,
              organizationId: auth.organizationId,
              invoiceId,
              originalFilename: file.originalname,
              declaredMimeType: file.mimetype.toLowerCase(),
              detectedMimeType: validated.detectedMimeType,
              sizeBytes: validated.sizeBytes,
              quarantineObjectKey: quarantineKey,
              createdByMembershipId: auth.membershipId,
            },
          });
          await transaction.documentProcessing.create({
            data: { organizationId: auth.organizationId, documentId, progress: 10 },
          });
          const created = await transaction.invoice.findFirstOrThrow({
            where: { id: invoiceId, organizationId: auth.organizationId },
            include: { documents: { include: { processing: true } } },
          });
          await writeAudit(transaction, {
            organizationId: auth.organizationId,
            actorMembershipId: auth.membershipId,
            action: 'INVOICE_UPLOADED',
            entityType: 'INVOICE',
            entityId: invoiceId,
            after: { documentId, status: created.status, sizeBytes: validated.sizeBytes },
          });
          return created;
        });
      } catch (error) {
        await this.storage
          .deleteObject(
            process.env.MINIO_QUARANTINE_BUCKET ?? 'bloctrust-quarantine',
            quarantineKey,
          )
          .catch(() => undefined);
        throw error;
      }

      try {
        await this.queue.enqueue({
          invoiceId,
          documentId,
          organizationId: auth.organizationId,
          correlationId,
        });
      } catch {
        await this.markManualReview(
          auth.organizationId,
          documentId,
          invoiceId,
          'QUEUE_UNAVAILABLE',
        );
      }
      return sanitizeInvoice(invoice);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  list(auth: AuthContext) {
    return this.database.run(auth.organizationId, async (transaction) => {
      const invoices = await transaction.invoice.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          documents: {
            select: { id: true, originalFilename: true, storageState: true, processing: true },
          },
        },
      });
      return invoices.map(sanitizeInvoice);
    });
  }

  get(auth: AuthContext, invoiceId: string) {
    return this.database.run(auth.organizationId, async (transaction) => {
      const invoice = await transaction.invoice.findFirst({
        where: { id: invoiceId, organizationId: auth.organizationId },
        include: {
          lines: { orderBy: { position: 'asc' } },
          documents: {
            select: {
              id: true,
              originalFilename: true,
              detectedMimeType: true,
              sizeBytes: true,
              storageState: true,
              duplicateOfDocumentId: true,
              processing: true,
            },
          },
        },
      });
      if (!invoice) throw notFound();
      return sanitizeInvoice(invoice);
    });
  }

  update(auth: AuthContext, invoiceId: string, dto: UpdateInvoiceDraftDto) {
    return this.database.run(auth.organizationId, async (transaction) => {
      const existing = await transaction.invoice.findFirst({
        where: { id: invoiceId, organizationId: auth.organizationId },
        include: {
          documents: {
            select: {
              storageState: true,
              processing: { select: { scanResult: true } },
            },
          },
        },
      });
      if (!existing) throw notFound();
      if (!canEditInvoiceDraft(existing.status, existing.documents)) {
        throw new ConflictException({ code: 'INVOICE_NOT_EDITABLE' });
      }
      const vendorId = dto.vendorId ?? existing.vendorId;
      const contractId = dto.contractId ?? existing.contractId;
      await this.assertRelationships(transaction, auth.organizationId, {
        ...(vendorId ? { vendorId } : {}),
        ...(contractId ? { contractId } : {}),
      });
      const result = await transaction.invoice.updateMany({
        where: { id: invoiceId, organizationId: auth.organizationId, version: dto.version },
        data: {
          ...(dto.vendorId !== undefined ? { vendorId: dto.vendorId } : {}),
          ...(dto.contractId !== undefined ? { contractId: dto.contractId } : {}),
          ...(dto.invoiceNumber !== undefined ? { invoiceNumber: dto.invoiceNumber.trim() } : {}),
          ...(dto.issueDate !== undefined ? { issueDate: new Date(dto.issueDate) } : {}),
          ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
          ...(dto.subtotal !== undefined ? { subtotal: dto.subtotal } : {}),
          ...(dto.taxAmount !== undefined ? { taxAmount: dto.taxAmount } : {}),
          ...(dto.totalAmount !== undefined ? { totalAmount: dto.totalAmount } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new ConflictException({ code: 'STALE_INVOICE_VERSION' });
      if (dto.lines) {
        await transaction.invoiceLine.deleteMany({
          where: { invoiceId, organizationId: auth.organizationId },
        });
        if (dto.lines.length) {
          await transaction.invoiceLine.createMany({
            data: dto.lines.map((line, position) => ({
              ...line,
              position,
              invoiceId,
              organizationId: auth.organizationId,
            })),
          });
        }
      }
      const updated = await transaction.invoice.findFirstOrThrow({
        where: { id: invoiceId, organizationId: auth.organizationId },
        include: {
          lines: { orderBy: { position: 'asc' } },
          documents: {
            select: { id: true, originalFilename: true, storageState: true, processing: true },
          },
        },
      });
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'INVOICE_DRAFT_UPDATED',
        entityType: 'INVOICE',
        entityId: invoiceId,
        before: invoiceAudit(existing),
        after: invoiceAudit(updated),
      });
      return sanitizeInvoice(updated);
    });
  }

  issueDownload(auth: AuthContext, documentId: string) {
    return this.database.run(auth.organizationId, async (transaction) => {
      const document = await approvedDocument(transaction, auth.organizationId, documentId);
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'DOCUMENT_DOWNLOAD_AUTHORIZED',
        entityType: 'DOCUMENT',
        entityId: document.id,
        after: { invoiceId: document.invoiceId, mimeType: document.detectedMimeType },
      });
      return {
        token: this.downloads.issue(document.id, auth.organizationId),
        expiresInSeconds: 60,
      };
    });
  }

  async download(
    auth: AuthContext,
    documentId: string,
    token: string | undefined,
  ): Promise<{ stream: Readable; mimeType: string; filename: string }> {
    this.downloads.verify(token, documentId, auth.organizationId);
    const document = await this.database.run(auth.organizationId, async (transaction) => {
      const found = await approvedDocument(transaction, auth.organizationId, documentId);
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'DOCUMENT_DOWNLOADED',
        entityType: 'DOCUMENT',
        entityId: found.id,
        after: { invoiceId: found.invoiceId, mimeType: found.detectedMimeType },
      });
      return found;
    });
    const stream = await this.storage.getObject(
      process.env.MINIO_APPROVED_BUCKET ?? 'bloctrust-approved',
      document.approvedObjectKey!,
    );
    return { stream, mimeType: document.detectedMimeType, filename: document.originalFilename };
  }

  private async assertRelationships(
    transaction: DatabaseTransaction,
    organizationId: string,
    dto: UploadInvoiceDto,
  ): Promise<void> {
    if (
      dto.vendorId &&
      !(await transaction.vendor.findFirst({
        where: { id: dto.vendorId, organizationId },
        select: { id: true },
      }))
    )
      throw notFound();
    if (dto.contractId) {
      if (!dto.vendorId) {
        throw new BadRequestException({ code: 'INVOICE_CONTRACT_REQUIRES_VENDOR' });
      }
      const contract = await transaction.contract.findFirst({
        where: { id: dto.contractId, organizationId, vendorId: dto.vendorId },
        select: { id: true },
      });
      if (!contract) throw notFound();
    }
  }

  private markManualReview(
    organizationId: string,
    documentId: string,
    invoiceId: string,
    code: string,
  ) {
    return this.database.run(organizationId, async (transaction) => {
      await transaction.documentProcessing.updateMany({
        where: { documentId, organizationId },
        data: { state: 'MANUAL_REVIEW', progress: 100, errorCode: code, completedAt: new Date() },
      });
      await transaction.invoice.updateMany({
        where: { id: invoiceId, organizationId },
        data: { status: 'MANUAL_REVIEW' },
      });
    });
  }
}

async function approvedDocument(
  transaction: DatabaseTransaction,
  organizationId: string,
  documentId: string,
) {
  const document = await transaction.document.findFirst({
    where: {
      id: documentId,
      organizationId,
      storageState: 'APPROVED',
      approvedObjectKey: { not: null },
    },
  });
  if (!document) throw notFound();
  return document;
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'INVOICE_RESOURCE_NOT_FOUND' });
}

function sanitizeInvoice<T>(invoice: T): T {
  return JSON.parse(
    JSON.stringify(invoice, (key, value: unknown) => {
      if (['quarantineObjectKey', 'approvedObjectKey', 'sha256', 'scanDetail'].includes(key))
        return undefined;
      return typeof value === 'bigint' ? value.toString() : value;
    }),
  ) as T;
}

function invoiceAudit(invoice: {
  id: string;
  status: string;
  version: number;
  vendorId: string | null;
  contractId: string | null;
  totalAmount: { toString(): string } | null;
}) {
  return {
    id: invoice.id,
    status: invoice.status,
    version: invoice.version,
    vendorId: invoice.vendorId,
    contractId: invoice.contractId,
    totalAmount: invoice.totalAmount?.toString() ?? null,
  };
}

export function canEditInvoiceDraft(
  status: string,
  documents: ReadonlyArray<{
    storageState: string;
    processing: { scanResult: string } | null;
  }>,
): boolean {
  if (status === 'NEEDS_REVIEW') return true;
  if (status !== 'MANUAL_REVIEW') return false;
  return documents.some(
    (document) =>
      document.storageState === 'APPROVED' && document.processing?.scanResult === 'CLEAN',
  );
}
