import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export type InvoiceIngestJob = Readonly<{
  invoiceId: string;
  documentId: string;
  organizationId: string;
  correlationId: string;
}>;

@Injectable()
export class InvoiceQueueService implements OnModuleDestroy {
  private readonly connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  private readonly queue = new Queue<InvoiceIngestJob>('bloctrust.invoice-ingest', {
    connection: this.connection,
  });

  async enqueue(job: InvoiceIngestJob): Promise<void> {
    await this.queue.add('invoice.ingest', job, {
      jobId: `invoice-${job.invoiceId}-ingest`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
