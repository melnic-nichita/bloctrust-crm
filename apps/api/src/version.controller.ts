import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator.js';

@Public()
@Controller('version')
export class VersionController {
  @Get()
  getVersion(): { name: string; version: string; environment: string } {
    return {
      name: 'bloctrust-api',
      version: process.env.APP_VERSION ?? '0.3.0-dev',
      environment: process.env.NODE_ENV ?? 'development',
    };
  }
}
