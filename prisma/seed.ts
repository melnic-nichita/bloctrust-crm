import { PrismaPg } from '@prisma/adapter-pg';
import { MembershipRole, PrismaClient } from '../apps/api/src/generated/prisma/client';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for seeding.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const ids = {
  organization: '00000000-0000-4000-8000-000000000001',
  owner: '00000000-0000-4000-8000-000000000002',
  membership: '00000000-0000-4000-8000-000000000003',
} as const;

async function main(): Promise<void> {
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.bloctrust.local' },
    update: { displayName: 'Demo Owner' },
    create: {
      id: ids.owner,
      email: 'owner@demo.bloctrust.local',
      displayName: 'Demo Owner',
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: 'bloc-trust-demo' },
    update: { name: 'BlocTrust Demo Association' },
    create: {
      id: ids.organization,
      slug: 'bloc-trust-demo',
      name: 'BlocTrust Demo Association',
    },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: owner.id,
      },
    },
    update: { role: MembershipRole.OWNER },
    create: {
      id: ids.membership,
      organizationId: organization.id,
      userId: owner.id,
      role: MembershipRole.OWNER,
    },
  });

  console.info('Seeded deterministic synthetic tenant:', organization.slug);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
