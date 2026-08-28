import { Module } from '@nestjs/common';
import { OrganizationScopeGuard } from '../organizations/organization-scope.guard.js';
import { BankEncryptionService } from './bank-encryption.service.js';
import { BuildingAccessService } from './building-access.service.js';
import { BuildingsController } from './buildings.controller.js';
import { BuildingsService } from './buildings.service.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { VendorsController } from './vendors.controller.js';
import { VendorsService } from './vendors.service.js';

@Module({
  controllers: [BuildingsController, VendorsController, ContractsController, DashboardController],
  providers: [
    OrganizationScopeGuard,
    BuildingAccessService,
    BankEncryptionService,
    BuildingsService,
    VendorsService,
    ContractsService,
    DashboardService,
  ],
})
export class CrmModule {}
