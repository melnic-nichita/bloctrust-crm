import {
  Body,
  Controller,
  Get,
  Header,
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
import { RequireRecentStepUp } from '../identity/step-up.decorator.js';
import { OrganizationScopeGuard } from '../organizations/organization-scope.guard.js';
import { expectedVersion } from './concurrency.js';
import {
  CreateBankAccountVersionDto,
  CreateVendorContactDto,
  CreateVendorDto,
  RevealBankAccountDto,
  UpdateVendorDto,
  VendorPageQueryDto,
  VerifyBankAccountDto,
} from './dto.js';
import { VendorsService } from './vendors.service.js';

@Controller('organizations/:organizationId/crm/vendors')
@UseGuards(OrganizationScopeGuard)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  list(@Req() request: AuthenticatedRequest, @Query() query: VendorPageQueryDto) {
    return this.vendors.list(request.auth, query);
  }

  @Get(':vendorId')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  get(@Req() request: AuthenticatedRequest, @Param('vendorId') vendorId: string) {
    return this.vendors.get(request.auth, vendorId);
  }

  @Post()
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateVendorDto) {
    return this.vendors.create(request.auth, dto);
  }

  @Patch(':vendorId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId') vendorId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendors.update(request.auth, vendorId, expectedVersion(ifMatch), dto);
  }

  @Post(':vendorId/contacts')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  @RequireRecentStepUp()
  addContact(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId') vendorId: string,
    @Body() dto: CreateVendorContactDto,
  ) {
    return this.vendors.addContact(request.auth, vendorId, dto);
  }

  @Get(':vendorId/bank-accounts')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  bankHistory(@Req() request: AuthenticatedRequest, @Param('vendorId') vendorId: string) {
    return this.vendors.bankHistory(request.auth, vendorId);
  }

  @Post(':vendorId/bank-accounts')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.ACCOUNTANT)
  @RequireRecentStepUp()
  addBankVersion(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId') vendorId: string,
    @Body() dto: CreateBankAccountVersionDto,
  ) {
    return this.vendors.addBankVersion(request.auth, vendorId, dto);
  }

  @Post(':vendorId/bank-accounts/:bankVersionId/verifications')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.ACCOUNTANT)
  @RequireRecentStepUp()
  verifyBankVersion(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId') vendorId: string,
    @Param('bankVersionId') bankVersionId: string,
    @Body() dto: VerifyBankAccountDto,
  ) {
    return this.vendors.verifyBankVersion(request.auth, vendorId, bankVersionId, dto);
  }

  @Post(':vendorId/bank-accounts/:bankVersionId/reveal')
  @Header('Cache-Control', 'no-store')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.ACCOUNTANT)
  @RequireRecentStepUp()
  revealBankVersion(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId') vendorId: string,
    @Param('bankVersionId') bankVersionId: string,
    @Body() dto: RevealBankAccountDto,
  ) {
    return this.vendors.revealBankVersion(request.auth, vendorId, bankVersionId, dto);
  }
}
