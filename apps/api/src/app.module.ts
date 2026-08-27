import { Module } from '@nestjs/common';
import { VersionController } from './version.controller.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [HealthModule],
  controllers: [VersionController],
})
export class AppModule {}
