import { Controller, Get } from '@nestjs/common';
import { HealthService, type ReadinessResult } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  ready(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }
}
