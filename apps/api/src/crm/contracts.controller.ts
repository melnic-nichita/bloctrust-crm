import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../identity/authenticated-request.js';
import { Roles } from '../identity/roles.decorator.js';
import { OrganizationScopeGuard } from '../organizations/organization-scope.guard.js';
import { expectedVersion } from './concurrency.js';
import { ContractsService } from './contracts.service.js';
import { ContractPageQueryDto, CreateContractDto, UpdateContractDto } from './dto.js';

@Controller('organizations/:organizationId/crm/contracts')
@UseGuards(OrganizationScopeGuard)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  list(@Req() request: AuthenticatedRequest, @Query() query: ContractPageQueryDto) {
    return this.contracts.list(request.auth, query);
  }

  @Get(':contractId')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  get(@Req() request: AuthenticatedRequest, @Param('contractId') contractId: string) {
    return this.contracts.get(request.auth, contractId);
  }

  @Post()
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateContractDto) {
    return this.contracts.create(request.auth, dto);
  }

  @Patch(':contractId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('contractId') contractId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.update(request.auth, contractId, expectedVersion(ifMatch), dto);
  }
}
