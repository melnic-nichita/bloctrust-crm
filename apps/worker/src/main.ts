import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

type SystemJob = {
  correlationId: string;
};

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

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

async function shutdown(signal: string): Promise<void> {
  console.info(JSON.stringify({ event: 'worker.shutdown', signal }));

  await worker.close();
  await connection.quit();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

console.info(JSON.stringify({ event: 'worker.started', queue: 'bloctrust.system' }));
