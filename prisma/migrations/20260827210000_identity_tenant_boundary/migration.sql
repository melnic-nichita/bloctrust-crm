CREATE TYPE "PasskeyChallengePurpose" AS ENUM ('REGISTRATION', 'STEP_UP');

ALTER TABLE "User" ADD COLUMN "passwordHash" VARCHAR(512);

ALTER TABLE "Session"
  ADD COLUMN "organizationId" UUID,
  ADD COLUMN "csrfTokenHash" VARCHAR(128),
  ADD COLUMN "rotationCounter" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stepUpVerifiedAt" TIMESTAMPTZ(3);

-- Milestone 0.1 created no sessions. If a developer created one manually, bind it
-- to an active membership and revoke it so the new CSRF/session contract starts cleanly.
UPDATE "Session" AS session
SET
  "organizationId" = (
    SELECT membership."organizationId"
    FROM "Membership" AS membership
    WHERE membership."userId" = session."userId" AND membership."status" = 'ACTIVE'
    ORDER BY membership."createdAt" ASC
    LIMIT 1
  ),
  "csrfTokenHash" = repeat('0', 64),
  "revokedAt" = COALESCE(session."revokedAt", CURRENT_TIMESTAMP);

DELETE FROM "Session" WHERE "organizationId" IS NULL OR "csrfTokenHash" IS NULL;

ALTER TABLE "Session"
  ALTER COLUMN "organizationId" SET NOT NULL,
  ALTER COLUMN "csrfTokenHash" SET NOT NULL;

CREATE TABLE "SessionRefreshToken" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "tokenHash" VARCHAR(128) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasskeyChallenge" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "purpose" "PasskeyChallengePurpose" NOT NULL,
  "challenge" VARCHAR(128) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_organizationId_revokedAt_idx" ON "Session"("organizationId", "revokedAt");
CREATE UNIQUE INDEX "SessionRefreshToken_tokenHash_key" ON "SessionRefreshToken"("tokenHash");
CREATE INDEX "SessionRefreshToken_sessionId_usedAt_revokedAt_idx"
  ON "SessionRefreshToken"("sessionId", "usedAt", "revokedAt");
CREATE UNIQUE INDEX "PasskeyChallenge_challenge_key" ON "PasskeyChallenge"("challenge");
CREATE INDEX "PasskeyChallenge_sessionId_purpose_usedAt_idx"
  ON "PasskeyChallenge"("sessionId", "purpose", "usedAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionRefreshToken"
  ADD CONSTRAINT "SessionRefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasskeyChallenge"
  ADD CONSTRAINT "PasskeyChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasskeyChallenge"
  ADD CONSTRAINT "PasskeyChallenge_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bloctrust_app') THEN
    CREATE ROLE bloctrust_app NOLOGIN;
  END IF;
END
$$;

GRANT bloctrust_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO bloctrust_app;
GRANT SELECT ON TABLE "User" TO bloctrust_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "Organization", "Membership", "Invitation"
  TO bloctrust_app;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User_tenant_membership" ON "User"
  FOR SELECT TO bloctrust_app
  USING (
    EXISTS (
      SELECT 1
      FROM "Membership" AS membership
      WHERE membership."userId" = "User"."id"
        AND membership."organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
    )
  );

CREATE POLICY "Organization_tenant_boundary" ON "Organization"
  TO bloctrust_app
  USING ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY "Membership_tenant_boundary" ON "Membership"
  TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY "Invitation_tenant_boundary" ON "Invitation"
  TO bloctrust_app
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
