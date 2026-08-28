import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MembershipRole } from '../generated/prisma/client.js';
import { RequireRecentStepUp } from '../identity/step-up.decorator.js';
import { Roles } from '../identity/roles.decorator.js';
import { OrganizationScopeGuard } from './organization-scope.guard.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations/:organizationId')
@UseGuards(OrganizationScopeGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  get(@Param('organizationId') organizationId: string) {
    return this.organizations.get(organizationId);
  }

  @Get('members')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.AUDITOR)
  @RequireRecentStepUp()
  listMembers(@Param('organizationId') organizationId: string) {
    return this.organizations.listMembers(organizationId);
  }
}
