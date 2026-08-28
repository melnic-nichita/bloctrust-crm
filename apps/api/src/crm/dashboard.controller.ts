import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../identity/authenticated-request.js';
import { Roles } from '../identity/roles.decorator.js';
import { OrganizationScopeGuard } from '../organizations/organization-scope.guard.js';
import { DashboardService } from './dashboard.service.js';
import { AuditPageQueryDto } from './dto.js';

@Controller('organizations/:organizationId/crm')
@UseGuards(OrganizationScopeGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  get(@Req() request: AuthenticatedRequest) {
    return this.dashboard.get(request.auth);
  }

  @Get('audit-events')
  @Roles(MembershipRole.OWNER, MembershipRole.AUDITOR)
  audit(@Req() request: AuthenticatedRequest, @Query() query: AuditPageQueryDto) {
    return this.dashboard.audit(request.auth, query);
  }
}
