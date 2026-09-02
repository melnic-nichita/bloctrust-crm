import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfGuard } from './common/csrf.guard.js';
import { CsrfService } from './common/csrf.service.js';
import { CrmModule } from './crm/crm.module.js';
import { DatabaseModule } from './database/database.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { RolesGuard } from './identity/roles.guard.js';
import { SessionAuthGuard } from './identity/session-auth.guard.js';
import { StepUpGuard } from './identity/step-up.guard.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { VersionController } from './version.controller.js';
import { HealthModule } from './health/health.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    IdentityModule,
    OrganizationsModule,
    CrmModule,
    InvoicesModule,
    IntegrationsModule,
  ],
  controllers: [VersionController],
  providers: [
    CsrfService,
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: StepUpGuard },
  ],
})
export class AppModule {}
