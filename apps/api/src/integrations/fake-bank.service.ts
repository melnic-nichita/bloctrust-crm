import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { writeAudit } from '../crm/audit.js';
import { TenantDatabaseService } from '../database/tenant-database.service.js';
import { canonicalJson } from '../risk/risk-engine.js';
import type { FakeBankWebhookDto } from './dto.js';
import { verifyFakeBankWebhook } from './fake-bank-webhook.js';

@Injectable()
export class FakeBankService {
  constructor(private readonly database: TenantDatabaseService) {}

  process(
    payload: FakeBankWebhookDto,
    timestamp: string | undefined,
    signature: string | undefined,
  ) {
    const secret = process.env.FAKE_BANK_WEBHOOK_SECRET;
    if (!secret) {
      throw new UnauthorizedException({ code: 'FAKE_BANK_WEBHOOK_NOT_CONFIGURED' });
    }
    if (!verifyFakeBankWebhook(payload, timestamp, signature, secret)) {
      throw new UnauthorizedException({ code: 'FAKE_BANK_SIGNATURE_INVALID' });
    }
    const payloadHash = createHash('sha256')
      .update(`${timestamp}.${canonicalJson(payload)}`)
      .digest('hex');
    return this.database.run(payload.organizationId, async (transaction) => {
      const replay = await transaction.fakeBankWebhookDelivery.findFirst({
        where: { organizationId: payload.organizationId, eventId: payload.eventId },
      });
      if (replay) {
        if (replay.payloadHash !== payloadHash) {
          throw new ConflictException({ code: 'FAKE_BANK_EVENT_ID_REUSED' });
        }
        return { accepted: true, duplicate: true, stateTransitioned: false };
      }
      const bankAccount = await transaction.vendorBankAccountVersion.findFirst({
        where: {
          id: payload.bankAccountVersionId,
          organizationId: payload.organizationId,
          vendorId: payload.vendorId,
        },
        select: { id: true },
      });
      if (!bankAccount) {
        throw new NotFoundException({ code: 'FAKE_BANK_ACCOUNT_NOT_FOUND' });
      }
      const status = payload.status;
      const previousDelivery = await transaction.fakeBankWebhookDelivery.findFirst({
        where: {
          organizationId: payload.organizationId,
          bankAccountVersionId: bankAccount.id,
        },
        select: { status: true },
        orderBy: { processedAt: 'desc' },
      });
      const stateTransitioned = (previousDelivery?.status ?? 'PENDING') !== status;
      await transaction.fakeBankWebhookDelivery.create({
        data: {
          organizationId: payload.organizationId,
          eventId: payload.eventId,
          vendorId: payload.vendorId,
          bankAccountVersionId: payload.bankAccountVersionId,
          status,
          payloadHash,
          providerTimestamp: new Date(Number(timestamp) * 1_000),
        },
      });
      await writeAudit(transaction, {
        organizationId: payload.organizationId,
        action: 'FAKE_BANK_STATUS_RECEIVED',
        entityType: 'FAKE_BANK_WEBHOOK',
        entityId: payload.eventId,
        after: {
          vendorId: payload.vendorId,
          bankAccountVersionId: payload.bankAccountVersionId,
          status,
          stateTransitioned,
        },
      });
      return { accepted: true, duplicate: false, stateTransitioned };
    });
  }
}
