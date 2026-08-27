import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';

export type ReadinessResult = {
  status: 'ok';
  dependencies: { postgres: 'up'; redis: 'up' };
};

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly postgres = new Pool({ connectionString: process.env.DATABASE_URL });
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  async readiness(): Promise<ReadinessResult> {
    try {
      await Promise.all([this.postgres.query('SELECT 1'), this.pingRedis()]);
      return { status: 'ok', dependencies: { postgres: 'up', redis: 'up' } };
    } catch {
      throw new ServiceUnavailableException({
        type: 'about:blank',
        title: 'A required dependency is unavailable',
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.postgres.end(), this.redis.quit()]);
  }

  private async pingRedis(): Promise<void> {
    if (this.redis.status === 'wait') {
      await this.redis.connect();
    }
    await this.redis.ping();
  }
}
