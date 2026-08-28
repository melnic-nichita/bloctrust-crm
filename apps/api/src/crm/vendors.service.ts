import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { BankAccountVerificationStatus, MembershipRole } from '../generated/prisma/client.js';
import { TenantDatabaseService } from '../database/tenant-database.service.js';
import type { DatabaseTransaction } from '../database/prisma.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { redactAuditReason, vendorAuditShape, writeAudit } from './audit.js';
import { BankEncryptionService } from './bank-encryption.service.js';
import { BuildingAccessService } from './building-access.service.js';
import { invalidCursor, staleWrite } from './concurrency.js';
import type {
  CreateBankAccountVersionDto,
  CreateVendorContactDto,
  CreateVendorDto,
  RevealBankAccountDto,
  UpdateVendorDto,
  VendorPageQueryDto,
  VerifyBankAccountDto,
} from './dto.js';

const bankPublicSelect = {
  id: true,
  vendorId: true,
  versionNumber: true,
  countryCode: true,
  maskedAccount: true,
  maskedAccountHolder: true,
  encryptionKeyId: true,
  createdAt: true,
  verifications: {
    select: { id: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

@Injectable()
export class VendorsService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly access: BuildingAccessService,
    private readonly encryption: BankEncryptionService,
  ) {}

  list(auth: AuthContext, query: VendorPageQueryDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const limit = query.limit;
      const scope = await this.vendorScope(transaction, auth);
      if (query.cursor) {
        const cursor = await transaction.vendor.findFirst({
          where: { id: query.cursor, organizationId: auth.organizationId, AND: [scope] },
          select: { id: true },
        });
        if (!cursor) throw invalidCursor();
      }
      const rows = await transaction.vendor.findMany({
        where: {
          organizationId: auth.organizationId,
          AND: [
            scope,
            ...(query.q
              ? [
                  {
                    OR: [
                      { legalName: { contains: query.q, mode: 'insensitive' as const } },
                      { tradingName: { contains: query.q, mode: 'insensitive' as const } },
                      { registrationNumber: { contains: query.q, mode: 'insensitive' as const } },
                      { tags: { has: query.q } },
                    ],
                  },
                ]
              : []),
          ],
          ...(query.status ? { status: query.status } : {}),
          ...(query.buildingId
            ? { buildingLinks: { some: { buildingId: query.buildingId } } }
            : {}),
        },
        select: {
          id: true,
          legalName: true,
          tradingName: true,
          registrationNumber: true,
          email: true,
          phone: true,
          status: true,
          tags: true,
          version: true,
          updatedAt: true,
          contacts: { select: { id: true, isVerified: true } },
          buildingLinks: { select: { building: { select: { id: true, name: true } } } },
          bankAccountVersions: {
            select: bankPublicSelect,
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ legalName: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });

      return this.page(rows, limit);
    });
  }

  get(auth: AuthContext, vendorId: string) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.assertCanReadVendor(transaction, auth, vendorId);
      const vendor = await transaction.vendor.findFirst({
        where: { id: vendorId, organizationId: auth.organizationId },
        include: {
          contacts: { orderBy: { createdAt: 'asc' } },
          buildingLinks: { include: { building: true }, orderBy: { createdAt: 'asc' } },
          bankAccountVersions: {
            select: bankPublicSelect,
            orderBy: { versionNumber: 'desc' },
          },
          contracts: {
            select: {
              id: true,
              reference: true,
              title: true,
              status: true,
              endsOn: true,
              version: true,
            },
            orderBy: { endsOn: 'asc' },
          },
        },
      });
      if (!vendor) throw this.notFound();
      return vendor;
    });
  }

  create(auth: AuthContext, dto: CreateVendorDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const buildingIds = [...new Set(dto.buildingIds ?? [])];
      await this.access.assertAllCanManage(transaction, auth, buildingIds);
      if (auth.role === MembershipRole.ADMINISTRATOR && buildingIds.length === 0) {
        throw new ConflictException({
          type: 'about:blank',
          title: 'An administrator must link a new vendor to an authorized building',
          status: 409,
          code: 'AUTHORIZED_BUILDING_REQUIRED',
        });
      }

      const { buildingIds: _buildingIds, ...vendorData } = dto;
      void _buildingIds;
      const vendor = await transaction.vendor.create({
        data: {
          organizationId: auth.organizationId,
          ...vendorData,
          tags: this.tags(dto.tags),
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
        action: 'VENDOR_CREATED',
        entityType: 'VENDOR',
        entityId: vendor.id,
        after: vendorAuditShape(vendor),
      });
      return vendor;
    });
  }

  update(auth: AuthContext, vendorId: string, expectedVersion: number, dto: UpdateVendorDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      const before = await this.assertCanManageVendor(transaction, auth, vendorId);
      const buildingIds = dto.buildingIds ? [...new Set(dto.buildingIds)] : undefined;
      if (buildingIds) await this.access.assertAllCanManage(transaction, auth, buildingIds);
      if (auth.role === MembershipRole.ADMINISTRATOR && buildingIds?.length === 0) {
        throw new ConflictException({
          type: 'about:blank',
          title: 'An administrator cannot remove the vendor from every authorized building',
          status: 409,
          code: 'AUTHORIZED_BUILDING_REQUIRED',
        });
      }

      const { buildingIds: _buildingIds, ...vendorData } = dto;
      void _buildingIds;
      const updated = await transaction.vendor.updateMany({
        where: { id: vendorId, organizationId: auth.organizationId, version: expectedVersion },
        data: {
          ...vendorData,
          ...(dto.tags ? { tags: this.tags(dto.tags) } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw staleWrite();

      if (buildingIds) {
        const requested = new Set(buildingIds);
        const current = new Set<string>(
          before.buildingLinks.map((link: { buildingId: string }) => link.buildingId),
        );
        const removed = [...current].filter((buildingId) => !requested.has(buildingId));
        const added = [...requested].filter((buildingId) => !current.has(buildingId));

        if (removed.length > 0) {
          const referenced = await transaction.contractBuilding.findFirst({
            where: {
              organizationId: auth.organizationId,
              contract: { vendorId },
              buildingId: { in: removed },
            },
            select: { buildingId: true },
          });
          if (referenced) {
            throw new ConflictException({
              type: 'about:blank',
              title: 'A vendor cannot be unlinked from a building referenced by an active contract',
              status: 409,
              code: 'VENDOR_BUILDING_CONTRACT_CONFLICT',
            });
          }
          await transaction.vendorBuilding.deleteMany({
            where: { organizationId: auth.organizationId, vendorId, buildingId: { in: removed } },
          });
        }
        if (added.length > 0) {
          await transaction.vendorBuilding.createMany({
            data: added.map((buildingId) => ({
              organizationId: auth.organizationId,
              vendorId,
              buildingId,
            })),
          });
        }
      }

      const after = await transaction.vendor.findUniqueOrThrow({ where: { id: vendorId } });
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'VENDOR_UPDATED',
        entityType: 'VENDOR',
        entityId: vendorId,
        before: vendorAuditShape(before),
        after: vendorAuditShape(after),
      });
      return after;
    });
  }

  addContact(auth: AuthContext, vendorId: string, dto: CreateVendorContactDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.assertCanManageVendor(transaction, auth, vendorId);
      return transaction.vendorContact.create({
        data: {
          organizationId: auth.organizationId,
          vendorId,
          ...dto,
          ...(dto.isVerified ? { verifiedAt: new Date() } : {}),
        },
      });
    });
  }

  bankHistory(auth: AuthContext, vendorId: string) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.assertCanReadVendor(transaction, auth, vendorId);
      return transaction.vendorBankAccountVersion.findMany({
        where: { organizationId: auth.organizationId, vendorId },
        select: bankPublicSelect,
        orderBy: { versionNumber: 'desc' },
      });
    });
  }

  addBankVersion(auth: AuthContext, vendorId: string, dto: CreateBankAccountVersionDto) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.assertCanReadVendor(transaction, auth, vendorId);
      const latest = await transaction.vendorBankAccountVersion.findFirst({
        where: { organizationId: auth.organizationId, vendorId },
        select: { versionNumber: true },
        orderBy: { versionNumber: 'desc' },
      });
      const encrypted = this.encryption.encrypt(auth.organizationId, vendorId, dto);

      try {
        const created = await transaction.vendorBankAccountVersion.create({
          data: {
            organizationId: auth.organizationId,
            vendorId,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            countryCode: dto.countryCode,
            createdByMembershipId: auth.membershipId,
            ...encrypted,
            verifications: {
              create: {
                status: BankAccountVerificationStatus.PENDING,
                verifiedByMembershipId: auth.membershipId,
                reason: 'New bank-account version requires independent verification',
              },
            },
          },
          select: bankPublicSelect,
        });
        await writeAudit(transaction, {
          organizationId: auth.organizationId,
          actorMembershipId: auth.membershipId,
          action: 'BANK_ACCOUNT_VERSION_CREATED',
          entityType: 'BANK_ACCOUNT',
          entityId: created.id,
          after: {
            vendorId,
            versionNumber: created.versionNumber,
            maskedAccount: created.maskedAccount,
            maskedAccountHolder: created.maskedAccountHolder,
            encryptionKeyId: created.encryptionKeyId,
          },
        });
        return created;
      } catch (error) {
        if (this.isUniqueConstraintError(error)) throw staleWrite();
        throw error;
      }
    });
  }

  verifyBankVersion(
    auth: AuthContext,
    vendorId: string,
    bankVersionId: string,
    dto: VerifyBankAccountDto,
  ) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.assertCanReadVendor(transaction, auth, vendorId);
      const version = await transaction.vendorBankAccountVersion.findFirst({
        where: { id: bankVersionId, organizationId: auth.organizationId, vendorId },
        select: { id: true, maskedAccount: true, versionNumber: true },
      });
      if (!version) throw this.bankNotFound();

      const { reason, evidenceReference, ...verificationData } = dto;
      const redactedReason = redactAuditReason(reason);
      const redactedEvidenceReference = redactAuditReason(evidenceReference);
      const verification = await transaction.vendorBankAccountVerification.create({
        data: {
          organizationId: auth.organizationId,
          bankAccountVersionId: bankVersionId,
          verifiedByMembershipId: auth.membershipId,
          ...verificationData,
          ...(redactedReason ? { reason: redactedReason } : {}),
          ...(redactedEvidenceReference ? { evidenceReference: redactedEvidenceReference } : {}),
        },
      });
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'BANK_ACCOUNT_VERIFICATION_RECORDED',
        entityType: 'BANK_ACCOUNT',
        entityId: bankVersionId,
        after: {
          vendorId,
          versionNumber: version.versionNumber,
          maskedAccount: version.maskedAccount,
          verificationStatus: verification.status,
        },
      });
      return verification;
    });
  }

  revealBankVersion(
    auth: AuthContext,
    vendorId: string,
    bankVersionId: string,
    dto: RevealBankAccountDto,
  ) {
    return this.tenantDatabase.run(auth.organizationId, async (transaction) => {
      await this.assertCanReadVendor(transaction, auth, vendorId);
      const stored = await transaction.vendorBankAccountVersion.findFirst({
        where: { id: bankVersionId, organizationId: auth.organizationId, vendorId },
      });
      if (!stored) throw this.bankNotFound();

      const account = this.encryption.decrypt(auth.organizationId, vendorId, stored);
      await writeAudit(transaction, {
        organizationId: auth.organizationId,
        actorMembershipId: auth.membershipId,
        action: 'BANK_ACCOUNT_REVEALED',
        entityType: 'BANK_ACCOUNT',
        entityId: stored.id,
        reason: redactAuditReason(dto.reason) ?? '[REDACTED]',
        after: {
          vendorId,
          versionNumber: stored.versionNumber,
          maskedAccount: stored.maskedAccount,
          revealed: true,
        },
      });

      return {
        id: stored.id,
        versionNumber: stored.versionNumber,
        countryCode: stored.countryCode,
        ...account,
      };
    });
  }

  private async vendorScope(
    transaction: DatabaseTransaction,
    auth: AuthContext,
  ): Promise<Prisma.VendorWhereInput> {
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

  private async assertCanReadVendor(
    transaction: DatabaseTransaction,
    auth: AuthContext,
    vendorId: string,
  ): Promise<void> {
    const scope = await this.vendorScope(transaction, auth);
    const vendor = await transaction.vendor.findFirst({
      where: { id: vendorId, organizationId: auth.organizationId, AND: [scope] },
      select: { id: true },
    });
    if (!vendor) throw this.notFound();
  }

  private async assertCanManageVendor(
    transaction: DatabaseTransaction,
    auth: AuthContext,
    vendorId: string,
  ) {
    const vendor = await transaction.vendor.findFirst({
      where: { id: vendorId, organizationId: auth.organizationId },
      include: { buildingLinks: { select: { buildingId: true } } },
    });
    if (!vendor) throw this.notFound();
    if (auth.role !== MembershipRole.OWNER && vendor.buildingLinks.length === 0) {
      throw this.notFound();
    }
    await this.access.assertAllCanManage(
      transaction,
      auth,
      vendor.buildingLinks.map((link: { buildingId: string }) => link.buildingId),
    );
    return vendor;
  }

  private tags(tags: string[] | undefined): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  }

  private page<T extends { id: string }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      type: 'about:blank',
      title: 'Vendor was not found',
      status: 404,
      code: 'VENDOR_NOT_FOUND',
    });
  }

  private bankNotFound(): NotFoundException {
    return new NotFoundException({
      type: 'about:blank',
      title: 'Bank-account version was not found',
      status: 404,
      code: 'BANK_ACCOUNT_VERSION_NOT_FOUND',
    });
  }
}
