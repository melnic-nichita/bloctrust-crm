import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

type SystemJob = { correlationId: string };

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker<SystemJob>(
  'bloctrust.system',
  async (job: Job<SystemJob>) => {
    console.info(
      JSON.stringify({
        event: 'job.completed',
        jobId: job.id,
        jobName: job.name,
        correlationId: job.data.correlationId,
      }),
    );
  },
  { connection },
);

worker.on('failed', (job, error) => {
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
