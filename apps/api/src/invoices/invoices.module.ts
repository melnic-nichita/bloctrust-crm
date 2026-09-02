import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { DownloadTokenService } from './download-token.service.js';
import { InvoiceQueueService } from './invoice-queue.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { ObjectStorageService } from './object-storage.service.js';

@Module({
  imports: [ApprovalsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, ObjectStorageService, InvoiceQueueService, DownloadTokenService],
})
export class InvoicesModule {}
