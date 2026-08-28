import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { TenantDatabaseService } from './tenant-database.service.js';

@Global()
@Module({
  providers: [PrismaService, TenantDatabaseService],
  exports: [PrismaService, TenantDatabaseService],
})
export class DatabaseModule {}
