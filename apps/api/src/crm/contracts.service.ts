import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { MembershipRole } from '../generated/prisma/client.js';
import { TenantDatabaseService } from '../database/tenant-database.service.js';
import type { DatabaseTransaction } from '../database/prisma.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { contractAuditShape, writeAudit } from './audit.js';
import { BuildingAccessService } from './building-access.service.js';
import { invalidCursor, staleWrite } from './concurrency.js';
import type { ContractPageQueryDto, CreateContractDto, UpdateContractDto } from './dto.js';

@Injectable()
export class ContractsService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly access: BuildingAccessService,
  ) {}

  list(auth: AuthContext, query: ContractPageQueryDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const limit = query.limit;
      const scope = await this.contractScope(transaction, auth);
      if (query.cursor) {
        const cursor = await transaction.contract.findFirst({
          where: { id: query.cursor, organizationId: auth.organizationId, AND: [scope] },
          select: { id: true },
        });
        if (!cursor) throw invalidCursor();
      }
      const rows = await transaction.contract.findMany({
        where: {
          organizationId: auth.organizationId,
          AND: [
            scope,
            ...(query.q
              ? [
                  {
                    OR: [
                      { reference: { contains: query.q, mode: 'insensitive' as const } },
                      { title: { contains: query.q, mode: 'insensitive' as const } },
                      { serviceCategory: { contains: query.q, mode: 'insensitive' as const } },
                      {
                        vendor: { legalName: { contains: query.q, mode: 'insensitive' as const } },
                      },
                    ],
                  },
                ]
              : []),
          ],
          ...(query.status ? { status: query.status } : {}),
          ...(query.vendorId ? { vendorId: query.vendorId } : {}),
          ...(query.buildingId
            ? { buildingLinks: { some: { buildingId: query.buildingId } } }
            : {}),
        },
        include: {
          vendor: { select: { id: true, legalName: true } },
          buildingLinks: { include: { building: { select: { id: true, name: true } } } },
        },
        orderBy: [{ endsOn: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      return this.page(rows, limit);
    });
  }

  get(auth: AuthContext, contractId: string) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const scope = await this.contractScope(transaction, auth);
      const contract = await transaction.contract.findFirst({
        where: { id: contractId, organizationId: auth.organizationId, AND: [scope] },
        include: {
          vendor: { select: { id: true, legalName: true, status: true } },
          buildingLinks: { include: { building: true } },
        },
      });
      if (!contract) throw this.notFound();
      return contract;
    });
  }

  create(auth: AuthContext, dto: CreateContractDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const buildingIds = [...new Set(dto.buildingIds)];
      await this.access.assertAllCanManage(transaction, auth, buildingIds);
      await this.assertVendorForBuildings(
        transaction,
        auth.organizationId,
        dto.vendorId,
        buildingIds,
      );
      const {
        buildingIds: _buildingIds,
        startsOn,
        endsOn,
        valueLimit,
        currency,
        ...contractData
      } = dto;
      void _buildingIds;
      const contract = await transaction.contract.create({
        data: {
          ...contractData,
          ...this.valueFields(valueLimit, currency),
          organizationId: auth.organizationId,
          startsOn: new Date(startsOn),
          ...(endsOn ? { endsOn: new Date(endsOn) } : {}),
          buildingLinks: {
            create: buildingIds.map((buildingId) => ({
              organizationId: auth.organizationId,
              buildingId,
            })),
          },
        },
      });
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'CONTRACT_CREATED',
        entityType: 'CONTRACT',
        entityId: contract.id,
        after: contractAuditShape(contract),
      });
      return contract;
    });
  }

  update(auth: AuthContext, contractId: string, expectedVersion: number, dto: UpdateContractDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const before = await transaction.contract.findFirst({
        where: { id: contractId, organizationId: auth.organizationId },
        include: { buildingLinks: { select: { buildingId: true } } },
      });
      if (!before) throw this.notFound();
      await this.access.assertAllCanManage(
        transaction,
        auth,
        before.buildingLinks.map((link: { buildingId: string }) => link.buildingId),
      );

      const buildingIds = dto.buildingIds ? [...new Set(dto.buildingIds)] : undefined;
      if (buildingIds) await this.access.assertAllCanManage(transaction, auth, buildingIds);
      await this.assertVendorForBuildings(
        transaction,
        auth.organizationId,
        dto.vendorId ?? before.vendorId,
        buildingIds ?? before.buildingLinks.map((link: { buildingId: string }) => link.buildingId),
      );
      const {
        buildingIds: _buildingIds,
        startsOn,
        endsOn,
        valueLimit,
        currency,
        ...contractData
      } = dto;
      void _buildingIds;
      const valueChanged = valueLimit !== undefined || currency !== undefined;
      if (buildingIds) {
        await transaction.contractBuilding.deleteMany({
          where: { organizationId: auth.organizationId, contractId },
        });
      }
      const updated = await transaction.contract.updateMany({
        where: {
          id: contractId,
          organizationId: auth.organizationId,
          version: expectedVersion,
        },
        data: {
          ...contractData,
          ...(valueChanged
            ? this.valueFields(
                valueLimit ?? before.valueLimit?.toString(),
                currency ?? before.currency,
              )
            : {}),
          ...(startsOn ? { startsOn: new Date(startsOn) } : {}),
          ...(endsOn ? { endsOn: new Date(endsOn) } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw staleWrite();

      if (buildingIds) {
        await transaction.contractBuilding.createMany({
          data: buildingIds.map((buildingId) => ({
            organizationId: auth.organizationId,
            contractId,
            buildingId,
          })),
        });
      }

      const after = await transaction.contract.findUniqueOrThrow({ where: { id: contractId } });
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'CONTRACT_UPDATED',
        entityType: 'CONTRACT',
        entityId: contractId,
        before: contractAuditShape(before),
        after: contractAuditShape(after),
      });
      return after;
    });
  }

  private async contractScope(
    transaction: DatabaseTransaction,
    auth: AuthContext,
  ): Promise<Prisma.ContractWhereInput> {
    if (auth.role === MembershipRole.OWNER || auth.role === MembershipRole.AUDITOR) return {};
    const now = new Date();
    const grants = await transaction.membershipBuildingAccess.findMany({
      where: {
        organizationId: auth.organizationId,
        membershipId: auth.membershipId,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: { buildingId: true },
    });
    return {
      buildingLinks: {
        some: {
          buildingId: { in: grants.map((grant: { buildingId: string }) => grant.buildingId) },
        },
      },
    };
  }

  private async assertVendorForBuildings(
    transaction: DatabaseTransaction,
    organizationId: string,
    vendorId: string,
    buildingIds: string[],
  ): Promise<void> {
    const vendor = await transaction.vendor.findFirst({
      where: { id: vendorId, organizationId },
      select: { id: true, buildingLinks: { select: { buildingId: true } } },
    });
    if (!vendor) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Vendor was not found',
        status: 404,
        code: 'VENDOR_NOT_FOUND',
      });
    }
    const vendorBuildings = new Set(
      vendor.buildingLinks.map((link: { buildingId: string }) => link.buildingId),
    );
    if (buildingIds.some((buildingId) => !vendorBuildings.has(buildingId))) {
      throw new UnprocessableEntityException({
        type: 'about:blank',
        title: 'The vendor must be authorized for every building on the contract',
        status: 422,
        code: 'VENDOR_BUILDING_LINK_REQUIRED',
      });
    }
  }

  private page<T extends { id: string }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null };
  }

  private valueFields(valueLimit: string | undefined, currency: string | null | undefined) {
    if (Boolean(valueLimit) !== Boolean(currency)) {
      throw new UnprocessableEntityException({
        type: 'about:blank',
        title: 'Contract value limit and currency must be supplied together',
        status: 422,
        code: 'CONTRACT_VALUE_CURRENCY_REQUIRED',
      });
    }
    return valueLimit && currency ? { valueLimit, currency } : { valueLimit: null, currency: null };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      type: 'about:blank',
      title: 'Contract was not found',
      status: 404,
      code: 'CONTRACT_NOT_FOUND',
    });
  }
}
