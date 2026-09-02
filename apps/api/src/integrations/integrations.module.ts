import { Module } from '@nestjs/common';
import { FakeBankController } from './fake-bank.controller.js';
import { FakeBankService } from './fake-bank.service.js';

@Module({
  controllers: [FakeBankController],
  providers: [FakeBankService],
  exports: [FakeBankService],
})
export class IntegrationsModule {}
