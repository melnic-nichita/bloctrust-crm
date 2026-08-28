import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { MembershipRole, MembershipStatus } from '../generated/prisma/client.js';
import { TenantDatabaseService } from '../database/tenant-database.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { BuildingAccessService } from './building-access.service.js';
import { invalidCursor, staleWrite } from './concurrency.js';
import type {
  CreateApartmentDto,
  CreateBuildingDto,
  CreateOccupancyDto,
  GrantBuildingAccessDto,
  PageQueryDto,
  UpdateBuildingDto,
} from './dto.js';

@Injectable()
export class BuildingsService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly access: BuildingAccessService,
  ) {}

  list(auth: AuthContext, query: PageQueryDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const limit = query.limit;
      const now = new Date();
      const accessWhere: Prisma.BuildingWhereInput =
        auth.role === MembershipRole.OWNER || auth.role === MembershipRole.AUDITOR
          ? {}
          : {
              OR: [
                {
                  membershipAccess: {
                    some: {
                      membershipId: auth.membershipId,
                      validFrom: { lte: now },
                      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
                    },
                  },
                },
                {
                  apartments: {
                    some: { occupancies: { some: { membershipId: auth.membershipId } } },
                  },
                },
              ],
            };
      if (query.cursor) {
        const cursor = await transaction.building.findFirst({
          where: { id: query.cursor, organizationId: auth.organizationId, AND: [accessWhere] },
          select: { id: true },
        });
        if (!cursor) throw invalidCursor();
      }
      const rows = await transaction.building.findMany({
        where: {
          organizationId: auth.organizationId,
          AND: [
            accessWhere,
            ...(query.q
              ? [
                  {
                    OR: [
                      { name: { contains: query.q, mode: 'insensitive' as const } },
                      { addressLine1: { contains: query.q, mode: 'insensitive' as const } },
                      { city: { contains: query.q, mode: 'insensitive' as const } },
                    ],
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          postalCode: true,
          countryCode: true,
          version: true,
          _count: { select: { apartments: true, vendorLinks: true, contractLinks: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });

      return this.page(rows, limit);
    });
  }

  get(auth: AuthContext, buildingId: string) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.access.assertCanRead(transaction, auth, buildingId);
      const building = await transaction.building.findFirst({
        where: { id: buildingId, organizationId: auth.organizationId },
        include: {
          apartments: {
            orderBy: { unitNumber: 'asc' },
            include: {
              occupancies: {
                orderBy: { startsOn: 'desc' },
                include: {
                  membership: {
                    select: {
                      id: true,
                      role: true,
                      status: true,
                      user: { select: { id: true, displayName: true, email: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!building) throw this.notFound('BUILDING_NOT_FOUND', 'Building was not found');
      return building;
    });
  }

  create(auth: AuthContext, dto: CreateBuildingDto) {
    return this.tenantDatabase.run(auth.organizationId, (transaction) =>
      transaction.building.create({
        data: { organizationId: auth.organizationId, ...dto },
      }),
    );
  }

  listResidents(auth: AuthContext) {
    return this.tenantDatabase.run(auth.organizationId, (transaction) =>
      transaction.membership.findMany({
        where: {
          organizationId: auth.organizationId,
          role: MembershipRole.RESIDENT,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          id: true,
          validUntil: true,
          user: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { user: { displayName: 'asc' } },
      }),
    );
  }

  update(auth: AuthContext, buildingId: string, version: number, dto: UpdateBuildingDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.access.assertCanManage(transaction, auth, buildingId);
      const updated = await transaction.building.updateMany({
        where: { id: buildingId, organizationId: auth.organizationId, version },
        data: { ...dto, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw staleWrite();
      return transaction.building.findUniqueOrThrow({ where: { id: buildingId } });
    });
  }

  addApartment(auth: AuthContext, buildingId: string, dto: CreateApartmentDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.access.assertBuildingExists(transaction, auth.organizationId, buildingId);
      await this.access.assertCanManage(transaction, auth, buildingId);
      return transaction.apartment.create({
        data: { organizationId: auth.organizationId, buildingId, ...dto },
      });
    });
  }

  grantAccess(auth: AuthContext, buildingId: string, dto: GrantBuildingAccessDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.access.assertBuildingExists(transaction, auth.organizationId, buildingId);
      const membership = await transaction.membership.findFirst({
        where: {
          id: dto.membershipId,
          organizationId: auth.organizationId,
          status: MembershipStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!membership) throw this.notFound('MEMBERSHIP_NOT_FOUND', 'Membership was not found');

      return transaction.membershipBuildingAccess.upsert({
        where: {
          organizationId_membershipId_buildingId: {
            organizationId: auth.organizationId,
            membershipId: dto.membershipId,
            buildingId,
          },
        },
        update: { validUntil: dto.validUntil ? new Date(dto.validUntil) : null },
        create: {
          organizationId: auth.organizationId,
          membershipId: dto.membershipId,
          buildingId,
          ...(dto.validUntil ? { validUntil: new Date(dto.validUntil) } : {}),
        },
      });
    });
  }

  addOccupancy(auth: AuthContext, apartmentId: string, dto: CreateOccupancyDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const apartment = await transaction.apartment.findFirst({
        where: { id: apartmentId, organizationId: auth.organizationId },
        select: { id: true, buildingId: true },
      });
      if (!apartment) throw this.notFound('APARTMENT_NOT_FOUND', 'Apartment was not found');
      await this.access.assertCanManage(transaction, auth, apartment.buildingId);

      const resident = await transaction.membership.findFirst({
        where: {
          id: dto.membershipId,
          organizationId: auth.organizationId,
          role: MembershipRole.RESIDENT,
          status: MembershipStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!resident) {
        throw new UnprocessableEntityException({
          type: 'about:blank',
          title: 'Occupancy requires an active resident membership in this organization',
          status: 422,
          code: 'RESIDENT_MEMBERSHIP_REQUIRED',
        });
      }

      return transaction.occupancy.create({
        data: {
          organizationId: auth.organizationId,
          apartmentId,
          membershipId: dto.membershipId,
          startsOn: new Date(dto.startsOn),
          ...(dto.endsOn ? { endsOn: new Date(dto.endsOn) } : {}),
        },
      });
    });
  }

  private page<T extends { id: string }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null };
  }

  private notFound(code: string, title: string): NotFoundException {
    return new NotFoundException({ type: 'about:blank', title, status: 404, code });
  }
}
