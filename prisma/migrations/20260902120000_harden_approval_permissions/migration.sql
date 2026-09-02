-- Approval decisions may validate a session only through tenant-scoped, non-secret fields.
-- Column privileges deliberately exclude refresh-token and CSRF hashes.
GRANT SELECT (
  "id",
  "organizationId",
  "userId",
  "revokedAt",
  "expiresAt",
  "stepUpVerifiedAt"
) ON TABLE "Session" TO bloctrust_app;

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session_approval_tenant_select" ON "Session"
  FOR SELECT TO bloctrust_app
  USING (
    "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );

-- Fake-bank deliveries are the status ledger. They are append-only evidence;
-- VendorBankAccountVersion remains immutable and is never updated by a webhook.
REVOKE UPDATE ON TABLE "FakeBankWebhookDelivery" FROM bloctrust_app;

CREATE TRIGGER "FakeBankWebhookDelivery_append_only"
  BEFORE UPDATE OR DELETE ON "FakeBankWebhookDelivery"
  FOR EACH ROW EXECUTE FUNCTION "bloctrust_reject_immutable_change"();
