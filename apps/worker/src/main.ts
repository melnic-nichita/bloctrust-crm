import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { InvoicePipeline, type InvoiceIngestJob } from './invoice-pipeline.js';

type SystemJob = {
  correlationId: string;
};

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const invoicePipeline = new InvoicePipeline();

const worker = new Worker<SystemJob, void>(
  'bloctrust.system',
  (job: Job<SystemJob>): Promise<void> => {
    console.info(
      JSON.stringify({
        event: 'job.completed',
        jobId: job.id,
        jobName: job.name,
        correlationId: job.data.correlationId,
      }),
    );

    return Promise.resolve();
  },
  { connection },
);

const invoiceWorker = new Worker<InvoiceIngestJob, void>(
  'bloctrust.invoice-ingest',
  async (job: Job<InvoiceIngestJob>): Promise<void> => {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await invoicePipeline.process(job.data, finalAttempt);
    console.info(
      JSON.stringify({
        event: 'invoice.ingest.completed',
        jobId: job.id,
        invoiceId: job.data.invoiceId,
      }),
    );
  },
  { connection, concurrency: Number(process.env.INVOICE_WORKER_CONCURRENCY ?? 2) },
);

worker.on('failed', (job: Job<SystemJob> | undefined, error: Error) => {
  console.error(
    JSON.stringify({
      event: 'job.failed',
      jobId: job?.id,
      jobName: job?.name,
      errorName: error.name,
    }),
  );
});

invoiceWorker.on('failed', (job, error) => {
  console.error(
    JSON.stringify({
      event: 'invoice.ingest.failed',
      jobId: job?.id,
      invoiceId: job?.data.invoiceId,
      errorName: error.name,
    }),
  );
});

async function shutdown(signal: string): Promise<void> {
  console.info(JSON.stringify({ event: 'worker.shutdown', signal }));

  await worker.close();
  await invoiceWorker.close();
  await invoicePipeline.close();
  await connection.quit();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

console.info(
  JSON.stringify({
    event: 'worker.started',
    queues: ['bloctrust.system', 'bloctrust.invoice-ingest'],
  }),
);
