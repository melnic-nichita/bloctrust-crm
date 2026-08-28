import '../environment.js';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required.');
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  transaction<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.$transaction((transaction) => work(transaction as unknown as DatabaseTransaction));
  }
}

export type DatabaseTransaction = Pick<
  PrismaService,
  | 'user'
  | 'organization'
  | 'membership'
  | 'invitation'
  | 'session'
  | 'sessionRefreshToken'
  | 'passkeyChallenge'
  | 'webAuthnCredential'
  | 'recoveryCode'
  | '$executeRawUnsafe'
  | '$queryRaw'
>;
