import { Module } from '@nestjs/common';
import { OrganizationScopeGuard } from './organization-scope.guard.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationScopeGuard],
})
export class OrganizationsModule {}
