-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BankAccountVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateTable
CREATE TABLE "Building" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "addressLine1" VARCHAR(200) NOT NULL,
    "addressLine2" VARCHAR(200),
    "city" VARCHAR(120) NOT NULL,
    "postalCode" VARCHAR(24) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apartment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "unitNumber" VARCHAR(40) NOT NULL,
    "floor" VARCHAR(20),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBuildingAccess" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipBuildingAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occupancy" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "apartmentId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "tradingName" VARCHAR(200),
    "registrationNumber" VARCHAR(80),
    "taxId" VARCHAR(80),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "status" "VendorStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[],
    "internalNotes" VARCHAR(4000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "role" VARCHAR(120),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBuilding" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBankAccountVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "encryptedAccount" TEXT NOT NULL,
    "encryptionIv" VARCHAR(64) NOT NULL,
    "encryptionTag" VARCHAR(64) NOT NULL,
    "encryptionKeyId" VARCHAR(80) NOT NULL,
    "accountFingerprint" VARCHAR(128) NOT NULL,
    "maskedAccount" VARCHAR(80) NOT NULL,
    "maskedAccountHolder" VARCHAR(200) NOT NULL,
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBankAccountVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBankAccountVerification" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "bankAccountVersionId" UUID NOT NULL,
    "status" "BankAccountVerificationStatus" NOT NULL,
    "evidenceReference" VARCHAR(500),
    "reason" VARCHAR(500),
    "verifiedByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBankAccountVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "reference" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "serviceCategory" VARCHAR(120) NOT NULL,
    "valueLimit" DECIMAL(19,2),
    "currency" CHAR(3),
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "documentReference" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractBuilding" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorMembershipId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" VARCHAR(500),
    "correlationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Building_organizationId_city_name_idx" ON "Building"("organizationId", "city", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Building_id_organizationId_key" ON "Building"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Building_organizationId_name_key" ON "Building"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Apartment_organizationId_unitNumber_idx" ON "Apartment"("organizationId", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Apartment_id_organizationId_key" ON "Apartment"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Apartment_organizationId_buildingId_unitNumber_key" ON "Apartment"("organizationId", "buildingId", "unitNumber");

-- CreateIndex
CREATE INDEX "MembershipBuildingAccess_organizationId_buildingId_validUnt_idx" ON "MembershipBuildingAccess"("organizationId", "buildingId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBuildingAccess_organizationId_membershipId_buildi_key" ON "MembershipBuildingAccess"("organizationId", "membershipId", "buildingId");

-- CreateIndex
CREATE INDEX "Occupancy_organizationId_apartmentId_startsOn_idx" ON "Occupancy"("organizationId", "apartmentId", "startsOn");

-- CreateIndex
CREATE INDEX "Occupancy_organizationId_membershipId_endsOn_idx" ON "Occupancy"("organizationId", "membershipId", "endsOn");

-- CreateIndex
CREATE INDEX "Vendor_organizationId_status_legalName_idx" ON "Vendor"("organizationId", "status", "legalName");

-- CreateIndex
CREATE INDEX "Vendor_organizationId_registrationNumber_idx" ON "Vendor"("organizationId", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_id_organizationId_key" ON "Vendor"("id", "organizationId");

-- CreateIndex
CREATE INDEX "VendorContact_organizationId_vendorId_isVerified_idx" ON "VendorContact"("organizationId", "vendorId", "isVerified");

-- CreateIndex
CREATE INDEX "VendorBuilding_organizationId_buildingId_idx" ON "VendorBuilding"("organizationId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBuilding_organizationId_vendorId_buildingId_key" ON "VendorBuilding"("organizationId", "vendorId", "buildingId");

-- CreateIndex
CREATE INDEX "VendorBankAccountVersion_organizationId_vendorId_createdAt_idx" ON "VendorBankAccountVersion"("organizationId", "vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorBankAccountVersion_organizationId_accountFingerprint_idx" ON "VendorBankAccountVersion"("organizationId", "accountFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBankAccountVersion_id_organizationId_key" ON "VendorBankAccountVersion"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBankAccountVersion_organizationId_vendorId_versionNum_key" ON "VendorBankAccountVersion"("organizationId", "vendorId", "versionNumber");

-- CreateIndex
CREATE INDEX "VendorBankAccountVerification_organizationId_bankAccountVer_idx" ON "VendorBankAccountVerification"("organizationId", "bankAccountVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "Contract_organizationId_status_endsOn_idx" ON "Contract"("organizationId", "status", "endsOn");

-- CreateIndex
CREATE INDEX "Contract_organizationId_vendorId_idx" ON "Contract"("organizationId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_id_organizationId_key" ON "Contract"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organizationId_reference_key" ON "Contract"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "ContractBuilding_organizationId_buildingId_idx" ON "ContractBuilding"("organizationId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractBuilding_organizationId_contractId_buildingId_key" ON "ContractBuilding"("organizationId", "contractId", "buildingId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_entityType_entityId_createdAt_idx" ON "AuditEvent"("organizationId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_organizationId_key" ON "Membership"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_buildingId_organizationId_fkey" FOREIGN KEY ("buildingId", "organizationId") REFERENCES "Building"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBuildingAccess" ADD CONSTRAINT "MembershipBuildingAccess_membershipId_organizationId_fkey" FOREIGN KEY ("membershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBuildingAccess" ADD CONSTRAINT "MembershipBuildingAccess_buildingId_organizationId_fkey" FOREIGN KEY ("buildingId", "organizationId") REFERENCES "Building"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_apartmentId_organizationId_fkey" FOREIGN KEY ("apartmentId", "organizationId") REFERENCES "Apartment"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_membershipId_organizationId_fkey" FOREIGN KEY ("membershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_organizationId_fkey" FOREIGN KEY ("vendorId", "organizationId") REFERENCES "Vendor"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBuilding" ADD CONSTRAINT "VendorBuilding_vendorId_organizationId_fkey" FOREIGN KEY ("vendorId", "organizationId") REFERENCES "Vendor"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBuilding" ADD CONSTRAINT "VendorBuilding_buildingId_organizationId_fkey" FOREIGN KEY ("buildingId", "organizationId") REFERENCES "Building"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBankAccountVersion" ADD CONSTRAINT "VendorBankAccountVersion_vendorId_organizationId_fkey" FOREIGN KEY ("vendorId", "organizationId") REFERENCES "Vendor"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBankAccountVersion" ADD CONSTRAINT "VendorBankAccountVersion_createdByMembershipId_organizatio_fkey" FOREIGN KEY ("createdByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBankAccountVerification" ADD CONSTRAINT "VendorBankAccountVerification_bankAccountVersionId_organiz_fkey" FOREIGN KEY ("bankAccountVersionId", "organizationId") REFERENCES "VendorBankAccountVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBankAccountVerification" ADD CONSTRAINT "VendorBankAccountVerification_verifiedByMembershipId_organ_fkey" FOREIGN KEY ("verifiedByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_vendorId_organizationId_fkey" FOREIGN KEY ("vendorId", "organizationId") REFERENCES "Vendor"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBuilding" ADD CONSTRAINT "ContractBuilding_contractId_organizationId_fkey" FOREIGN KEY ("contractId", "organizationId") REFERENCES "Contract"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBuilding" ADD CONSTRAINT "ContractBuilding_buildingId_organizationId_fkey" FOREIGN KEY ("buildingId", "organizationId") REFERENCES "Building"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorMembershipId_organizationId_fkey" FOREIGN KEY ("actorMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants that must hold even when a future application path is incorrect.
ALTER TABLE "Building"
  ADD CONSTRAINT "Building_countryCode_check" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "Building_version_check" CHECK ("version" > 0);
ALTER TABLE "Apartment"
  ADD CONSTRAINT "Apartment_version_check" CHECK ("version" > 0);
ALTER TABLE "MembershipBuildingAccess"
  ADD CONSTRAINT "MembershipBuildingAccess_dates_check" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom");
ALTER TABLE "Occupancy"
  ADD CONSTRAINT "Occupancy_dates_check" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");
ALTER TABLE "Vendor"
  ADD CONSTRAINT "Vendor_version_check" CHECK ("version" > 0);
ALTER TABLE "VendorBankAccountVersion"
  ADD CONSTRAINT "VendorBankAccountVersion_countryCode_check" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "VendorBankAccountVersion_versionNumber_check" CHECK ("versionNumber" > 0);
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_dates_check" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"),
  ADD CONSTRAINT "Contract_value_currency_check" CHECK (
    ("valueLimit" IS NULL AND "currency" IS NULL)
    OR ("valueLimit" >= 0 AND "currency" ~ '^[A-Z]{3}$')
  ),
  ADD CONSTRAINT "Contract_version_check" CHECK ("version" > 0);

-- Bank versions, their verification statements, and audit events are evidence.
-- They are append-only even for privileged application code. A deliberate tenant
-- purge can opt in to DELETE only; UPDATE is never allowed.
CREATE FUNCTION "bloctrust_reject_immutable_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_immutable_purge', true) = 'true' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "VendorBankAccountVersion_append_only"
  BEFORE UPDATE OR DELETE ON "VendorBankAccountVersion"
  FOR EACH ROW EXECUTE FUNCTION "bloctrust_reject_immutable_change"();
CREATE TRIGGER "VendorBankAccountVerification_append_only"
  BEFORE UPDATE OR DELETE ON "VendorBankAccountVerification"
  FOR EACH ROW EXECUTE FUNCTION "bloctrust_reject_immutable_change"();
CREATE TRIGGER "AuditEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "bloctrust_reject_immutable_change"();

-- A contract may cover only buildings already authorized on its vendor passport.
CREATE FUNCTION "bloctrust_validate_contract_vendor_building"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Contract" AS contract
    JOIN "VendorBuilding" AS vendor_building
      ON vendor_building."organizationId" = contract."organizationId"
     AND vendor_building."vendorId" = contract."vendorId"
     AND vendor_building."buildingId" = NEW."buildingId"
    WHERE contract."id" = NEW."contractId"
      AND contract."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'contract vendor is not authorized for building' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ContractBuilding_vendor_authorization"
  BEFORE INSERT OR UPDATE ON "ContractBuilding"
  FOR EACH ROW EXECUTE FUNCTION "bloctrust_validate_contract_vendor_building"();

CREATE FUNCTION "bloctrust_validate_contract_vendor_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."vendorId" IS DISTINCT FROM OLD."vendorId" AND EXISTS (
    SELECT 1
    FROM "ContractBuilding" AS contract_building
    WHERE contract_building."contractId" = NEW."id"
      AND contract_building."organizationId" = NEW."organizationId"
      AND NOT EXISTS (
        SELECT 1
        FROM "VendorBuilding" AS vendor_building
        WHERE vendor_building."organizationId" = NEW."organizationId"
          AND vendor_building."vendorId" = NEW."vendorId"
          AND vendor_building."buildingId" = contract_building."buildingId"
      )
  ) THEN
    RAISE EXCEPTION 'contract vendor is not authorized for every building' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Contract_vendor_authorization"
  BEFORE UPDATE OF "vendorId" ON "Contract"
  FOR EACH ROW EXECUTE FUNCTION "bloctrust_validate_contract_vendor_change"();

CREATE FUNCTION "bloctrust_protect_vendor_building_contract"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ContractBuilding" AS contract_building
    JOIN "Contract" AS contract
      ON contract."id" = contract_building."contractId"
     AND contract."organizationId" = contract_building."organizationId"
    WHERE contract_building."organizationId" = OLD."organizationId"
      AND contract_building."buildingId" = OLD."buildingId"
      AND contract."vendorId" = OLD."vendorId"
  ) THEN
    RAISE EXCEPTION 'vendor building link is referenced by a contract' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "VendorBuilding_contract_reference"
  BEFORE DELETE ON "VendorBuilding"
  FOR EACH ROW EXECUTE FUNCTION "bloctrust_protect_vendor_building_contract"();

GRANT SELECT, INSERT, UPDATE ON TABLE
  "Building", "Apartment", "MembershipBuildingAccess", "Occupancy",
  "Vendor", "VendorContact", "VendorBuilding", "Contract", "ContractBuilding"
  TO bloctrust_app;
GRANT DELETE ON TABLE "VendorBuilding", "ContractBuilding" TO bloctrust_app;
GRANT SELECT, INSERT ON TABLE
  "VendorBankAccountVersion", "VendorBankAccountVerification", "AuditEvent"
  TO bloctrust_app;

ALTER TABLE "Building" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Apartment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipBuildingAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Occupancy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorBuilding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorBankAccountVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorBankAccountVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractBuilding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Building_tenant_boundary" ON "Building" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "Apartment_tenant_boundary" ON "Apartment" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "MembershipBuildingAccess_tenant_boundary" ON "MembershipBuildingAccess" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "Occupancy_tenant_boundary" ON "Occupancy" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "Vendor_tenant_boundary" ON "Vendor" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "VendorContact_tenant_boundary" ON "VendorContact" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "VendorBuilding_tenant_boundary" ON "VendorBuilding" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "VendorBankAccountVersion_tenant_boundary" ON "VendorBankAccountVersion" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "VendorBankAccountVerification_tenant_boundary" ON "VendorBankAccountVerification" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "Contract_tenant_boundary" ON "Contract" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "ContractBuilding_tenant_boundary" ON "ContractBuilding" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "AuditEvent_tenant_boundary" ON "AuditEvent" TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
