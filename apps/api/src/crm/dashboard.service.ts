import { Injectable } from '@nestjs/common';
import { ContractStatus, MembershipRole, VendorStatus } from '../generated/prisma/client.js';
import { TenantDatabaseService } from '../database/tenant-database.service.js';
import type { DatabaseTransaction } from '../database/prisma.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import type { AuditPageQueryDto } from './dto.js';
import { invalidCursor } from './concurrency.js';

@Injectable()
export class DashboardService {
  constructor(private readonly tenantDatabase: TenantDatabaseService) {}

  get(auth: AuthContext) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const now = new Date();
      const expiresBefore = new Date(now);
      expiresBefore.setUTCDate(expiresBefore.getUTCDate() + 60);
      const buildingScope = await this.buildingScope(transaction, auth, now);
      const contractWhere = buildingScope
        ? { buildingLinks: { some: { buildingId: { in: buildingScope } } } }
        : {};
      const vendorWhere = buildingScope
        ? { buildingLinks: { some: { buildingId: { in: buildingScope } } } }
        : {};

      const expiringContracts = await transaction.contract.findMany({
        where: {
          organizationId: auth.organizationId,
          status: ContractStatus.ACTIVE,
          endsOn: { gte: now, lte: expiresBefore },
          ...contractWhere,
        },
        select: {
          id: true,
          reference: true,
          title: true,
          endsOn: true,
          vendor: { select: { id: true, legalName: true } },
        },
        orderBy: { endsOn: 'asc' },
        take: 25,
      });
      const vendorCandidates = await transaction.vendor.findMany({
        where: {
          organizationId: auth.organizationId,
          status: { not: VendorStatus.ARCHIVED },
          ...vendorWhere,
        },
        select: {
          id: true,
          legalName: true,
          registrationNumber: true,
          taxId: true,
          email: true,
          phone: true,
          contacts: { select: { isVerified: true } },
          bankAccountVersions: {
            select: {
              id: true,
              verifications: {
                select: { status: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
        orderBy: { legalName: 'asc' },
        take: 100,
      });

      const incompleteVendors = vendorCandidates
        .map(
          (vendor: {
            id: string;
            legalName: string;
            registrationNumber: string | null;
            taxId: string | null;
            email: string | null;
            phone: string | null;
            contacts: { isVerified: boolean }[];
            bankAccountVersions: { verifications: { status: string }[] }[];
          }) => {
            const missing = [
              !vendor.registrationNumber && 'registration number',
              !vendor.taxId && 'tax identifier',
              (!vendor.email || !vendor.phone) && 'contact details',
              !vendor.contacts.some((contact: { isVerified: boolean }) => contact.isVerified) &&
                'verified contact',
              !vendor.bankAccountVersions[0] && 'bank-account version',
              vendor.bankAccountVersions[0] &&
                vendor.bankAccountVersions[0].verifications[0]?.status !== 'VERIFIED' &&
                'verified bank account',
            ].filter((item): item is string => Boolean(item));
            return { id: vendor.id, legalName: vendor.legalName, missing };
          },
        )
        .filter((vendor: { missing: string[] }) => vendor.missing.length > 0)
        .slice(0, 25);

      return {
        generatedAt: now.toISOString(),
        expiringContracts,
        incompleteVendors,
      };
    });
  }

  audit(auth: AuthContext, query: AuditPageQueryDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      if (query.cursor) {
        const cursor = await transaction.auditEvent.findFirst({
          where: { id: query.cursor, organizationId: auth.organizationId },
          select: { id: true },
        });
        if (!cursor) throw invalidCursor();
      }
      const rows = await transaction.auditEvent.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.entityId ? { entityId: query.entityId } : {}),
        },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          before: true,
          after: true,
          reason: true,
          correlationId: true,
          createdAt: true,
          actorMembership: {
            select: { id: true, user: { select: { displayName: true, email: true } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > query.limit;
      const data = hasMore ? rows.slice(0, query.limit) : rows;
      return { data, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null };
    });
  }

  private async buildingScope(
    transaction: DatabaseTransaction,
    auth: AuthContext,
    now: Date,
  ): Promise<string[] | undefined> {
    if (auth.role === MembershipRole.OWNER || auth.role === MembershipRole.AUDITOR)
      return undefined;
    const grants = await transaction.membershipBuildingAccess.findMany({
      where: {
        organizationId: auth.organizationId,
        membershipId: auth.membershipId,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: { buildingId: true },
    });
    return grants.map((grant: { buildingId: string }) => grant.buildingId);
  }
}
