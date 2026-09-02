import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../identity/authenticated-request.js';
import { Roles } from '../identity/roles.decorator.js';
import { RequireRecentStepUp } from '../identity/step-up.decorator.js';
import { OrganizationScopeGuard } from '../organizations/organization-scope.guard.js';
import { ApprovalsService } from './approvals.service.js';
import { ApprovalDecisionDto, UpdateRiskPolicyDto } from './dto.js';

@Controller('organizations/:organizationId')
@UseGuards(OrganizationScopeGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('approval-requests')
  @Header('Cache-Control', 'no-store')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  list(@Req() request: AuthenticatedRequest) {
    return this.approvals.list(request.auth);
  }

  @Get('approval-requests/:requestId')
  @Header('Cache-Control', 'no-store')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  get(@Req() request: AuthenticatedRequest, @Param('requestId') requestId: string) {
    return this.approvals.get(request.auth, requestId);
  }

  @Post('approval-requests/:requestId/decisions')
  @RequireRecentStepUp()
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.ACCOUNTANT)
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvals.decide(request.auth, requestId, dto, idempotencyKey);
  }

  @Get('risk-policy')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.AUDITOR)
  policy(@Req() request: AuthenticatedRequest) {
    return this.approvals.getPolicy(request.auth);
  }

  @Patch('risk-policy')
  @RequireRecentStepUp()
  @Roles(MembershipRole.OWNER)
  updatePolicy(@Req() request: AuthenticatedRequest, @Body() dto: UpdateRiskPolicyDto) {
    return this.approvals.updatePolicy(request.auth, dto);
  }
}
