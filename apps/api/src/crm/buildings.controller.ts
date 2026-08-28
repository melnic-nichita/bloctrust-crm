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
import { RequireRecentStepUp } from '../identity/step-up.decorator.js';
import { OrganizationScopeGuard } from '../organizations/organization-scope.guard.js';
import { BuildingsService } from './buildings.service.js';
import { expectedVersion } from './concurrency.js';
import {
  CreateApartmentDto,
  CreateBuildingDto,
  CreateOccupancyDto,
  GrantBuildingAccessDto,
  PageQueryDto,
  UpdateBuildingDto,
} from './dto.js';

@Controller('organizations/:organizationId/crm')
@UseGuards(OrganizationScopeGuard)
export class BuildingsController {
  constructor(private readonly buildings: BuildingsService) {}

  @Get('buildings')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.RESIDENT,
    MembershipRole.AUDITOR,
  )
  list(@Req() request: AuthenticatedRequest, @Query() query: PageQueryDto) {
    return this.buildings.list(request.auth, query);
  }

  @Get('residents')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  listResidents(@Req() request: AuthenticatedRequest) {
    return this.buildings.listResidents(request.auth);
  }

  @Get('buildings/:buildingId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.AUDITOR)
  get(@Req() request: AuthenticatedRequest, @Param('buildingId') buildingId: string) {
    return this.buildings.get(request.auth, buildingId);
  }

  @Post('buildings')
  @Roles(MembershipRole.OWNER)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateBuildingDto) {
    return this.buildings.create(request.auth, dto);
  }

  @Patch('buildings/:buildingId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('buildingId') buildingId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.buildings.update(request.auth, buildingId, expectedVersion(ifMatch), dto);
  }

  @Post('buildings/:buildingId/apartments')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  addApartment(
    @Req() request: AuthenticatedRequest,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateApartmentDto,
  ) {
    return this.buildings.addApartment(request.auth, buildingId, dto);
  }

  @Post('buildings/:buildingId/access')
  @Roles(MembershipRole.OWNER)
  @RequireRecentStepUp()
  grantAccess(
    @Req() request: AuthenticatedRequest,
    @Param('buildingId') buildingId: string,
    @Body() dto: GrantBuildingAccessDto,
  ) {
    return this.buildings.grantAccess(request.auth, buildingId, dto);
  }

  @Post('apartments/:apartmentId/occupancies')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR)
  addOccupancy(
    @Req() request: AuthenticatedRequest,
    @Param('apartmentId') apartmentId: string,
    @Body() dto: CreateOccupancyDto,
  ) {
    return this.buildings.addOccupancy(request.auth, apartmentId, dto);
  }
}
