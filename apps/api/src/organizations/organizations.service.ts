import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantDatabaseService } from '../database/tenant-database.service.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly tenantDatabase: TenantDatabaseService) {}

  async get(organizationId: string) {
    const organization = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, slug: true, name: true, createdAt: true },
      }),
    );

    if (!organization) throw this.notFound();

    return organization;
  }

  listMembers(organizationId: string) {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.membership.findMany({
        where: { organizationId },
        select: {
          id: true,
          role: true,
          status: true,
          validUntil: true,
          createdAt: true,
          user: { select: { id: true, email: true, displayName: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      type: 'about:blank',
      title: 'Organization was not found',
      status: 404,
      code: 'ORGANIZATION_NOT_FOUND',
    });
  }
}
