CREATE TYPE "InvoiceStatus" AS ENUM ('PROCESSING', 'NEEDS_REVIEW', 'MANUAL_REVIEW', 'BLOCKED');
CREATE TYPE "DocumentKind" AS ENUM ('INVOICE_SOURCE');
CREATE TYPE "DocumentStorageState" AS ENUM ('QUARANTINED', 'APPROVED', 'BLOCKED');
CREATE TYPE "DocumentProcessingState" AS ENUM ('QUARANTINED', 'SCANNING', 'PARSED', 'NEEDS_REVIEW', 'MANUAL_REVIEW', 'BLOCKED');
CREATE TYPE "DocumentScanResult" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

CREATE TABLE "Invoice" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "vendorId" UUID,
  "contractId" UUID,
  "invoiceNumber" VARCHAR(80),
  "issueDate" DATE,
  "dueDate" DATE,
  "currency" CHAR(3),
  "subtotal" DECIMAL(19,2),
  "taxAmount" DECIMAL(19,2),
  "totalAmount" DECIMAL(19,2),
  "notes" VARCHAR(4000),
  "status" "InvoiceStatus" NOT NULL DEFAULT 'PROCESSING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unitPrice" DECIMAL(19,4) NOT NULL,
  "taxRate" DECIMAL(7,4),
  "amount" DECIMAL(19,2) NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "kind" "DocumentKind" NOT NULL DEFAULT 'INVOICE_SOURCE',
  "originalFilename" VARCHAR(255) NOT NULL,
  "declaredMimeType" VARCHAR(120) NOT NULL,
  "detectedMimeType" VARCHAR(120) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "quarantineObjectKey" VARCHAR(512) NOT NULL,
  "approvedObjectKey" VARCHAR(512),
  "sha256" CHAR(64),
  "duplicateOfDocumentId" UUID,
  "storageState" "DocumentStorageState" NOT NULL DEFAULT 'QUARANTINED',
  "createdByMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentProcessing" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "state" "DocumentProcessingState" NOT NULL DEFAULT 'QUARANTINED',
  "progress" INTEGER NOT NULL DEFAULT 10,
  "scanResult" "DocumentScanResult" NOT NULL DEFAULT 'PENDING',
  "scanDetail" VARCHAR(500),
  "ocrEngine" VARCHAR(80),
  "suggestions" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastHeartbeatAt" TIMESTAMPTZ(3),
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "errorCode" VARCHAR(80),
  "errorMessage" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DocumentProcessing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_id_organizationId_key" ON "Invoice"("id", "organizationId");
CREATE INDEX "Invoice_organizationId_status_createdAt_idx" ON "Invoice"("organizationId", "status", "createdAt");
CREATE INDEX "Invoice_organizationId_vendorId_invoiceNumber_idx" ON "Invoice"("organizationId", "vendorId", "invoiceNumber");
CREATE INDEX "Invoice_organizationId_contractId_idx" ON "Invoice"("organizationId", "contractId");
CREATE UNIQUE INDEX "InvoiceLine_organizationId_invoiceId_position_key" ON "InvoiceLine"("organizationId", "invoiceId", "position");
CREATE INDEX "InvoiceLine_organizationId_invoiceId_idx" ON "InvoiceLine"("organizationId", "invoiceId");
CREATE UNIQUE INDEX "Document_quarantineObjectKey_key" ON "Document"("quarantineObjectKey");
CREATE UNIQUE INDEX "Document_approvedObjectKey_key" ON "Document"("approvedObjectKey");
CREATE UNIQUE INDEX "Document_id_organizationId_key" ON "Document"("id", "organizationId");
CREATE INDEX "Document_organizationId_invoiceId_idx" ON "Document"("organizationId", "invoiceId");
CREATE INDEX "Document_organizationId_sha256_idx" ON "Document"("organizationId", "sha256");
CREATE INDEX "Document_organizationId_duplicateOfDocumentId_idx" ON "Document"("organizationId", "duplicateOfDocumentId");
CREATE UNIQUE INDEX "DocumentProcessing_documentId_organizationId_key" ON "DocumentProcessing"("documentId", "organizationId");
CREATE INDEX "DocumentProcessing_organizationId_state_updatedAt_idx" ON "DocumentProcessing"("organizationId", "state", "updatedAt");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_vendorId_organizationId_fkey" FOREIGN KEY ("vendorId", "organizationId") REFERENCES "Vendor"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_organizationId_fkey" FOREIGN KEY ("contractId", "organizationId") REFERENCES "Contract"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByMembershipId_organizationId_fkey" FOREIGN KEY ("createdByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Invoice"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Invoice"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdByMembershipId_organizationId_fkey" FOREIGN KEY ("createdByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_duplicateOfDocumentId_organizationId_fkey" FOREIGN KEY ("duplicateOfDocumentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentProcessing" ADD CONSTRAINT "DocumentProcessing_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dates_check" CHECK ("dueDate" IS NULL OR "issueDate" IS NULL OR "dueDate" >= "issueDate"), ADD CONSTRAINT "Invoice_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'), ADD CONSTRAINT "Invoice_amounts_check" CHECK (("subtotal" IS NULL OR "subtotal" >= 0) AND ("taxAmount" IS NULL OR "taxAmount" >= 0) AND ("totalAmount" IS NULL OR "totalAmount" >= 0)), ADD CONSTRAINT "Invoice_version_check" CHECK ("version" > 0);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_values_check" CHECK ("position" >= 0 AND "quantity" > 0 AND "unitPrice" >= 0 AND "amount" >= 0 AND ("taxRate" IS NULL OR "taxRate" >= 0));
ALTER TABLE "Document" ADD CONSTRAINT "Document_size_check" CHECK ("sizeBytes" > 0), ADD CONSTRAINT "Document_sha256_check" CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "DocumentProcessing" ADD CONSTRAINT "DocumentProcessing_progress_check" CHECK ("progress" BETWEEN 0 AND 100), ADD CONSTRAINT "DocumentProcessing_attempts_check" CHECK ("attempts" >= 0);

CREATE FUNCTION "bloctrust_validate_invoice_contract_vendor"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."contractId" IS NOT NULL AND (
    NEW."vendorId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "Contract" WHERE "id" = NEW."contractId" AND "organizationId" = NEW."organizationId" AND "vendorId" = NEW."vendorId"
    )
  ) THEN
    RAISE EXCEPTION 'invoice contract does not belong to vendor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Invoice_contract_vendor" BEFORE INSERT OR UPDATE OF "vendorId", "contractId" ON "Invoice" FOR EACH ROW EXECUTE FUNCTION "bloctrust_validate_invoice_contract_vendor"();

CREATE FUNCTION "bloctrust_protect_document_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
    OR NEW."quarantineObjectKey" IS DISTINCT FROM OLD."quarantineObjectKey"
    OR (OLD."approvedObjectKey" IS NOT NULL AND NEW."approvedObjectKey" IS DISTINCT FROM OLD."approvedObjectKey")
    OR (OLD."sha256" IS NOT NULL AND NEW."sha256" IS DISTINCT FROM OLD."sha256") THEN
    RAISE EXCEPTION 'document identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Document_identity_immutable" BEFORE UPDATE ON "Document" FOR EACH ROW EXECUTE FUNCTION "bloctrust_protect_document_identity"();

CREATE FUNCTION "bloctrust_validate_document_processing_transition"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
    (OLD."state" = 'QUARANTINED' AND NEW."state" IN ('SCANNING', 'MANUAL_REVIEW'))
    OR (OLD."state" = 'SCANNING' AND NEW."state" IN ('QUARANTINED', 'PARSED', 'BLOCKED', 'MANUAL_REVIEW'))
    OR (OLD."state" = 'PARSED' AND NEW."state" IN ('NEEDS_REVIEW', 'MANUAL_REVIEW'))
  ) THEN
    RAISE EXCEPTION 'invalid document processing transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DocumentProcessing_valid_transition" BEFORE UPDATE OF "state" ON "DocumentProcessing" FOR EACH ROW EXECUTE FUNCTION "bloctrust_validate_document_processing_transition"();

GRANT SELECT, INSERT, UPDATE ON TABLE "Invoice", "InvoiceLine", "Document", "DocumentProcessing" TO bloctrust_app;
GRANT DELETE ON TABLE "InvoiceLine" TO bloctrust_app;

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentProcessing" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoice_tenant_boundary" ON "Invoice" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "InvoiceLine_tenant_boundary" ON "InvoiceLine" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "Document_tenant_boundary" ON "Document" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "DocumentProcessing_tenant_boundary" ON "DocumentProcessing" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
