import { PrismaPg } from '@prisma/adapter-pg';
import {
  BankAccountVerificationStatus,
  ContractStatus,
  MembershipRole,
  PrismaClient,
  VendorStatus,
} from '../apps/api/src/generated/prisma/client';
import { BankEncryptionService } from '../apps/api/src/crm/bank-encryption.service';
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
  resident: '00000000-0000-4000-8000-000000000004',
  residentMembership: '00000000-0000-4000-8000-000000000005',
  building: '00000000-0000-4000-8000-000000000006',
  apartment: '00000000-0000-4000-8000-000000000007',
  occupancy: '00000000-0000-4000-8000-000000000008',
  vendor: '00000000-0000-4000-8000-000000000009',
  vendorBuilding: '00000000-0000-4000-8000-000000000010',
  vendorContact: '00000000-0000-4000-8000-000000000011',
  bankVersion: '00000000-0000-4000-8000-000000000012',
  contract: '00000000-0000-4000-8000-000000000013',
  contractBuilding: '00000000-0000-4000-8000-000000000014',
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

  const resident = await prisma.user.upsert({
    where: { email: 'resident@demo.bloctrust.local' },
    update: { displayName: 'Elena Resident' },
    create: {
      id: ids.resident,
      email: 'resident@demo.bloctrust.local',
      displayName: 'Elena Resident',
    },
  });
  const residentMembership = await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId: organization.id, userId: resident.id },
    },
    update: { role: MembershipRole.RESIDENT },
    create: {
      id: ids.residentMembership,
      organizationId: organization.id,
      userId: resident.id,
      role: MembershipRole.RESIDENT,
    },
  });
  const building = await prisma.building.upsert({
    where: { id: ids.building },
    update: { name: 'Stefan cel Mare 100' },
    create: {
      id: ids.building,
      organizationId: organization.id,
      name: 'Stefan cel Mare 100',
      addressLine1: 'Bd. Stefan cel Mare si Sfant 100',
      city: 'Chisinau',
      postalCode: 'MD-2001',
      countryCode: 'MD',
    },
  });
  const apartment = await prisma.apartment.upsert({
    where: { id: ids.apartment },
    update: { unitNumber: '18' },
    create: {
      id: ids.apartment,
      organizationId: organization.id,
      buildingId: building.id,
      unitNumber: '18',
      floor: '4',
    },
  });
  await prisma.occupancy.upsert({
    where: { id: ids.occupancy },
    update: {},
    create: {
      id: ids.occupancy,
      organizationId: organization.id,
      apartmentId: apartment.id,
      membershipId: residentMembership.id,
      startsOn: new Date('2025-01-01T00:00:00.000Z'),
    },
  });

  const vendor = await prisma.vendor.upsert({
    where: { id: ids.vendor },
    update: { legalName: 'Nord Lift Service SRL', status: VendorStatus.ACTIVE },
    create: {
      id: ids.vendor,
      organizationId: organization.id,
      legalName: 'Nord Lift Service SRL',
      registrationNumber: 'DEMO-101010',
      taxId: '100000000001',
      email: 'operations@nord-lift.example',
      phone: '+373 22 000 100',
      status: VendorStatus.ACTIVE,
      tags: ['elevator', 'critical-service'],
      internalNotes: 'Synthetic demonstration vendor. Never use these details for payment.',
    },
  });
  await prisma.vendorBuilding.upsert({
    where: {
      organizationId_vendorId_buildingId: {
        organizationId: organization.id,
        vendorId: vendor.id,
        buildingId: building.id,
      },
    },
    update: {},
    create: {
      id: ids.vendorBuilding,
      organizationId: organization.id,
      vendorId: vendor.id,
      buildingId: building.id,
    },
  });
  await prisma.vendorContact.upsert({
    where: { id: ids.vendorContact },
    update: { isVerified: true },
    create: {
      id: ids.vendorContact,
      organizationId: organization.id,
      vendorId: vendor.id,
      name: 'Mihai Demo',
      role: 'Service coordinator',
      email: 'mihai@nord-lift.example',
      phone: '+373 69 000 100',
      isVerified: true,
      verifiedAt: new Date('2026-08-01T10:00:00.000Z'),
    },
  });

  const existingBankVersion = await prisma.vendorBankAccountVersion.findUnique({
    where: {
      organizationId_vendorId_versionNumber: {
        organizationId: organization.id,
        vendorId: vendor.id,
        versionNumber: 1,
      },
    },
  });
  if (!existingBankVersion) {
    const encrypted = new BankEncryptionService().encrypt(organization.id, vendor.id, {
      accountNumber: 'MD24AG000000000000000001',
      accountHolder: 'Nord Lift Service SRL',
      bankName: 'Synthetic Demo Bank',
    });
    await prisma.vendorBankAccountVersion.create({
      data: {
        id: ids.bankVersion,
        organizationId: organization.id,
        vendorId: vendor.id,
        versionNumber: 1,
        countryCode: 'MD',
        createdByMembershipId: ids.membership,
        ...encrypted,
        verifications: {
          create: {
            status: BankAccountVerificationStatus.VERIFIED,
            evidenceReference: 'demo://independent-callback/2026-08-01',
            reason: 'Synthetic verification evidence for local demonstration only',
            verifiedByMembershipId: ids.membership,
          },
        },
      },
    });
  }

  const contract = await prisma.contract.upsert({
    where: { id: ids.contract },
    update: { status: ContractStatus.ACTIVE },
    create: {
      id: ids.contract,
      organizationId: organization.id,
      vendorId: vendor.id,
      reference: 'DEMO-LIFT-2026',
      title: 'Elevator preventive maintenance',
      serviceCategory: 'Elevator maintenance',
      valueLimit: '24000.00',
      currency: 'MDL',
      startsOn: new Date('2026-01-01T00:00:00.000Z'),
      endsOn: new Date('2026-12-31T00:00:00.000Z'),
      status: ContractStatus.ACTIVE,
      documentReference: 'demo://contract/DEMO-LIFT-2026',
    },
  });
  await prisma.contractBuilding.upsert({
    where: {
      organizationId_contractId_buildingId: {
        organizationId: organization.id,
        contractId: contract.id,
        buildingId: building.id,
      },
    },
    update: {},
    create: {
      id: ids.contractBuilding,
      organizationId: organization.id,
      contractId: contract.id,
      buildingId: building.id,
    },
  });

  console.info('Seeded deterministic synthetic Milestone 0.3 tenant:', organization.slug);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
