import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { DatabaseTransaction } from '../database/prisma.service.js';
import { MembershipRole } from '../generated/prisma/client.js';
import type { AuthContext } from '../identity/auth-context.js';

@Injectable()
export class BuildingAccessService {
  async assertCanRead(
    transaction: DatabaseTransaction,
    auth: AuthContext,
    buildingId: string,
  ): Promise<void> {
    if (auth.role === MembershipRole.OWNER || auth.role === MembershipRole.AUDITOR) return;

    const now = new Date();
    const [grant, occupancy] = await Promise.all([
      transaction.membershipBuildingAccess.findFirst({
        where: {
          organizationId: auth.organizationId,
          buildingId,
          membershipId: auth.membershipId,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        select: { id: true },
      }),
      transaction.occupancy.findFirst({
        where: {
          organizationId: auth.organizationId,
          membershipId: auth.membershipId,
          apartment: { buildingId },
          startsOn: { lte: now },
          OR: [{ endsOn: null }, { endsOn: { gte: now } }],
        },
        select: { id: true },
      }),
    ]);
    if (grant || occupancy) return;

    throw new NotFoundException({
      type: 'about:blank',
      title: 'Building was not found',
      status: 404,
      code: 'BUILDING_NOT_FOUND',
    });
  }

  async assertCanManage(
    transaction: DatabaseTransaction,
    auth: AuthContext,
    buildingId: string,
  ): Promise<void> {
    if (auth.role === MembershipRole.OWNER) return;

    if (auth.role === MembershipRole.ADMINISTRATOR) {
      const now = new Date();
      const grant = await transaction.membershipBuildingAccess.findFirst({
        where: {
          organizationId: auth.organizationId,
          buildingId,
          membershipId: auth.membershipId,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        select: { id: true },
      });
      if (grant) return;
    }

    throw new ForbiddenException({
      type: 'about:blank',
      title: 'Your membership is not authorized to manage this building',
      status: 403,
      code: 'BUILDING_ACCESS_FORBIDDEN',
    });
  }

  async assertAllCanManage(
    transaction: DatabaseTransaction,
    auth: AuthContext,
    buildingIds: string[],
  ): Promise<void> {
    for (const buildingId of [...new Set(buildingIds)]) {
      await this.assertBuildingExists(transaction, auth.organizationId, buildingId);
      await this.assertCanManage(transaction, auth, buildingId);
    }
  }

  async assertBuildingExists(
    transaction: DatabaseTransaction,
    organizationId: string,
    buildingId: string,
  ): Promise<void> {
    const building = await transaction.building.findFirst({
      where: { id: buildingId, organizationId },
      select: { id: true },
    });
    if (building) return;

    throw new NotFoundException({
      type: 'about:blank',
      title: 'Building was not found',
      status: 404,
      code: 'BUILDING_NOT_FOUND',
    });
  }
}
