import { Controller, Get } from '@nestjs/common';

@Controller('version')
export class VersionController {
  @Get()
  getVersion(): { name: string; version: string; environment: string } {
    return {
      name: 'bloctrust-api',
      version: process.env.APP_VERSION ?? '0.1.0-dev',
      environment: process.env.NODE_ENV ?? 'development',
    };
  }
}
