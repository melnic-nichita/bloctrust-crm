import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import type { DatabaseTransaction } from './prisma.service.js';

type TenantWork<T> = (transaction: DatabaseTransaction) => Promise<T>;

@Injectable()
export class TenantDatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(organizationId: string, work: TenantWork<T>): Promise<T> {
    return this.prisma.transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL ROLE bloctrust_app');
      await transaction.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;

      return work(transaction);
    });
  }
}
