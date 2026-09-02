ALTER TYPE "InvoiceStatus" ADD VALUE 'AWAITING_APPROVAL';
ALTER TYPE "InvoiceStatus" ADD VALUE 'APPROVED';
ALTER TYPE "InvoiceStatus" ADD VALUE 'REJECTED';

CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'INVALIDATED');
CREATE TYPE "ApprovalDecisionOutcome" AS ENUM ('APPROVE', 'REJECT');

ALTER TABLE "Session" ADD CONSTRAINT "Session_id_organizationId_key" UNIQUE ("id", "organizationId");
ALTER TABLE "VendorBankAccountVersion"
  ADD COLUMN "externalStatus" "BankAccountVerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "externalStatusUpdatedAt" TIMESTAMPTZ(3);
ALTER TABLE "Invoice" ADD COLUMN "vendorBankAccountVersionId" UUID;

CREATE TABLE "OrganizationRiskPolicy" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "ruleVersion" INTEGER NOT NULL DEFAULT 1,
  "mediumThreshold" INTEGER NOT NULL DEFAULT 30,
  "highThreshold" INTEGER NOT NULL DEFAULT 70,
  "changedBankAccountScore" INTEGER NOT NULL DEFAULT 70,
  "duplicateHashScore" INTEGER NOT NULL DEFAULT 70,
  "duplicateInvoiceNumberScore" INTEGER NOT NULL DEFAULT 35,
  "contractLimitScore" INTEGER NOT NULL DEFAULT 50,
  "amountSpikeScore" INTEGER NOT NULL DEFAULT 25,
  "requireSeparationOfDuties" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OrganizationRiskPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RiskAssessment" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "invoiceVersion" INTEGER NOT NULL,
  "ruleVersion" INTEGER NOT NULL,
  "facts" JSONB NOT NULL,
  "contributions" JSONB NOT NULL,
  "totalScore" INTEGER NOT NULL,
  "level" "RiskLevel" NOT NULL,
  "evidenceHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRequest" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "invoiceVersion" INTEGER NOT NULL,
  "riskAssessmentId" UUID NOT NULL,
  "vendorBankAccountVersionId" UUID,
  "version" INTEGER NOT NULL,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requiredDecisions" INTEGER NOT NULL,
  "initiatedByMembershipId" UUID NOT NULL,
  "idempotencyKeyHash" CHAR(64) NOT NULL,
  "invalidatedReason" VARCHAR(500),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalDecision" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "approvalRequestId" UUID NOT NULL,
  "approvalVersion" INTEGER NOT NULL,
  "decidedByMembershipId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "outcome" "ApprovalDecisionOutcome" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "stepUpVerifiedAt" TIMESTAMPTZ(3) NOT NULL,
  "idempotencyKeyHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FakeBankWebhookDelivery" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "bankAccountVersionId" UUID NOT NULL,
  "status" "BankAccountVerificationStatus" NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "providerTimestamp" TIMESTAMPTZ(3) NOT NULL,
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FakeBankWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationRiskPolicy_organizationId_key" ON "OrganizationRiskPolicy"("organizationId");
CREATE UNIQUE INDEX "RiskAssessment_id_organizationId_key" ON "RiskAssessment"("id", "organizationId");
CREATE UNIQUE INDEX "RiskAssessment_organizationId_invoiceId_invoiceVersion_key" ON "RiskAssessment"("organizationId", "invoiceId", "invoiceVersion");
CREATE INDEX "RiskAssessment_organizationId_level_createdAt_idx" ON "RiskAssessment"("organizationId", "level", "createdAt");
CREATE UNIQUE INDEX "ApprovalRequest_riskAssessmentId_key" ON "ApprovalRequest"("riskAssessmentId");
CREATE UNIQUE INDEX "ApprovalRequest_id_organizationId_key" ON "ApprovalRequest"("id", "organizationId");
CREATE UNIQUE INDEX "ApprovalRequest_organizationId_invoiceId_version_key" ON "ApprovalRequest"("organizationId", "invoiceId", "version");
CREATE UNIQUE INDEX "ApprovalRequest_organizationId_idempotencyKeyHash_key" ON "ApprovalRequest"("organizationId", "idempotencyKeyHash");
CREATE UNIQUE INDEX "ApprovalRequest_riskAssessmentId_organizationId_key" ON "ApprovalRequest"("riskAssessmentId", "organizationId");
CREATE INDEX "ApprovalRequest_organizationId_status_createdAt_idx" ON "ApprovalRequest"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "ApprovalDecision_organizationId_approvalRequestId_decidedByMembershipId_key" ON "ApprovalDecision"("organizationId", "approvalRequestId", "decidedByMembershipId");
CREATE UNIQUE INDEX "ApprovalDecision_organizationId_idempotencyKeyHash_key" ON "ApprovalDecision"("organizationId", "idempotencyKeyHash");
CREATE INDEX "ApprovalDecision_organizationId_approvalRequestId_createdAt_idx" ON "ApprovalDecision"("organizationId", "approvalRequestId", "createdAt");
CREATE UNIQUE INDEX "FakeBankWebhookDelivery_organizationId_eventId_key" ON "FakeBankWebhookDelivery"("organizationId", "eventId");
CREATE INDEX "FakeBankWebhookDelivery_organizationId_bankAccountVersionId_processedAt_idx" ON "FakeBankWebhookDelivery"("organizationId", "bankAccountVersionId", "processedAt");
CREATE INDEX "Invoice_organizationId_vendorBankAccountVersionId_idx" ON "Invoice"("organizationId", "vendorBankAccountVersionId");

ALTER TABLE "OrganizationRiskPolicy" ADD CONSTRAINT "OrganizationRiskPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Invoice"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Invoice"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_riskAssessmentId_organizationId_fkey" FOREIGN KEY ("riskAssessmentId", "organizationId") REFERENCES "RiskAssessment"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_vendorBankAccountVersionId_organizationId_fkey" FOREIGN KEY ("vendorBankAccountVersionId", "organizationId") REFERENCES "VendorBankAccountVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_initiatedByMembershipId_organizationId_fkey" FOREIGN KEY ("initiatedByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_approvalRequestId_organizationId_fkey" FOREIGN KEY ("approvalRequestId", "organizationId") REFERENCES "ApprovalRequest"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_decidedByMembershipId_organizationId_fkey" FOREIGN KEY ("decidedByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "Session"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FakeBankWebhookDelivery" ADD CONSTRAINT "FakeBankWebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FakeBankWebhookDelivery" ADD CONSTRAINT "FakeBankWebhookDelivery_bankAccountVersionId_organizationId_fkey" FOREIGN KEY ("bankAccountVersionId", "organizationId") REFERENCES "VendorBankAccountVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FakeBankWebhookDelivery" ADD CONSTRAINT "FakeBankWebhookDelivery_vendorId_organizationId_fkey" FOREIGN KEY ("vendorId", "organizationId") REFERENCES "Vendor"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_vendorBankAccountVersionId_organizationId_fkey" FOREIGN KEY ("vendorBankAccountVersionId", "organizationId") REFERENCES "VendorBankAccountVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationRiskPolicy" ADD CONSTRAINT "OrganizationRiskPolicy_thresholds_check" CHECK ("ruleVersion" > 0 AND "mediumThreshold" > 0 AND "highThreshold" > "mediumThreshold"), ADD CONSTRAINT "OrganizationRiskPolicy_scores_check" CHECK ("changedBankAccountScore" >= 0 AND "duplicateHashScore" >= 0 AND "duplicateInvoiceNumberScore" >= 0 AND "contractLimitScore" >= 0 AND "amountSpikeScore" >= 0);
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_values_check" CHECK ("invoiceVersion" > 0 AND "ruleVersion" > 0 AND "totalScore" >= 0 AND "evidenceHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_values_check" CHECK ("invoiceVersion" > 0 AND "version" > 0 AND "requiredDecisions" BETWEEN 1 AND 2 AND "idempotencyKeyHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_values_check" CHECK ("approvalVersion" > 0 AND length(trim("reason")) >= 10 AND "idempotencyKeyHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "FakeBankWebhookDelivery" ADD CONSTRAINT "FakeBankWebhookDelivery_payloadHash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$');

CREATE FUNCTION "bloctrust_protect_risk_assessment"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_immutable_purge', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'risk assessments are immutable evidence' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "RiskAssessment_immutable" BEFORE UPDATE OR DELETE ON "RiskAssessment" FOR EACH ROW EXECUTE FUNCTION "bloctrust_protect_risk_assessment"();

CREATE FUNCTION "bloctrust_protect_approval_decision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_immutable_purge', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'approval decisions are immutable evidence' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "ApprovalDecision_immutable" BEFORE UPDATE OR DELETE ON "ApprovalDecision" FOR EACH ROW EXECUTE FUNCTION "bloctrust_protect_approval_decision"();

CREATE FUNCTION "bloctrust_validate_approval_request_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
    OR NEW."invoiceVersion" IS DISTINCT FROM OLD."invoiceVersion"
    OR NEW."riskAssessmentId" IS DISTINCT FROM OLD."riskAssessmentId"
    OR NEW."vendorBankAccountVersionId" IS DISTINCT FROM OLD."vendorBankAccountVersionId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."requiredDecisions" IS DISTINCT FROM OLD."requiredDecisions"
    OR NEW."initiatedByMembershipId" IS DISTINCT FROM OLD."initiatedByMembershipId"
    OR NEW."idempotencyKeyHash" IS DISTINCT FROM OLD."idempotencyKeyHash" THEN
    RAISE EXCEPTION 'approval request evidence is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" <> 'PENDING' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'completed approval request is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ApprovalRequest_valid_update" BEFORE UPDATE ON "ApprovalRequest" FOR EACH ROW EXECUTE FUNCTION "bloctrust_validate_approval_request_update"();

CREATE FUNCTION "bloctrust_guard_invoice_approval"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'APPROVED' AND OLD."status" IS DISTINCT FROM NEW."status" AND NOT EXISTS (
    SELECT 1 FROM "ApprovalRequest"
    WHERE "organizationId" = NEW."organizationId"
      AND "invoiceId" = NEW."id"
      AND "invoiceVersion" = NEW."version"
      AND "status" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'invoice requires a completed approval request' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Invoice_approval_guard" BEFORE UPDATE OF "status" ON "Invoice" FOR EACH ROW EXECUTE FUNCTION "bloctrust_guard_invoice_approval"();

GRANT SELECT, INSERT, UPDATE ON TABLE "OrganizationRiskPolicy", "RiskAssessment", "ApprovalRequest", "FakeBankWebhookDelivery" TO bloctrust_app;
GRANT SELECT, INSERT ON TABLE "ApprovalDecision" TO bloctrust_app;

ALTER TABLE "OrganizationRiskPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FakeBankWebhookDelivery" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "OrganizationRiskPolicy_tenant_boundary" ON "OrganizationRiskPolicy" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "RiskAssessment_tenant_boundary" ON "RiskAssessment" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "ApprovalRequest_tenant_boundary" ON "ApprovalRequest" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "ApprovalDecision_tenant_boundary" ON "ApprovalDecision" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "FakeBankWebhookDelivery_tenant_boundary" ON "FakeBankWebhookDelivery" TO bloctrust_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
