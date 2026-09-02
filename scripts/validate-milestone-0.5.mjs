import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const migrationPath =
  'prisma/migrations/20260831120000_explainable_risk_dual_approval/migration.sql';
const required = [
  migrationPath,
  'apps/api/src/risk/risk-engine.ts',
  'apps/api/src/approvals/approvals.service.ts',
  'apps/api/src/approvals/approvals.controller.ts',
  'apps/api/src/integrations/fake-bank-webhook.ts',
  'apps/api/src/integrations/fake-bank.service.ts',
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  'apps/worker/Dockerfile',
  '.github/workflows/ci.yml',
  'scripts/validate-containers.mjs',
  'apps/web/app/approvals/page.tsx',
  'tests/security/risk-engine.spec.ts',
  'tests/security/fake-bank-webhook.spec.ts',
  'tests/security/approval-abuse.integration.spec.ts',
  'docs/adr/011-explainable-risk-and-separation-of-duties.md',
  'docs/milestone-0.5.md',
];
for (const file of required) if (!existsSync(file)) failures.push(`Missing ${file}`);

const root = JSON.parse(readFileSync('package.json', 'utf8'));
if (root.version !== '0.5.0') failures.push('Root package version must be 0.5.0');
const schema = readFileSync('prisma/schema.prisma', 'utf8');
for (const model of [
  'OrganizationRiskPolicy',
  'RiskAssessment',
  'ApprovalRequest',
  'ApprovalDecision',
  'FakeBankWebhookDelivery',
]) {
  if (!schema.includes(`model ${model} {`)) failures.push(`Missing Prisma model ${model}`);
}
const migration = readFileSync(migrationPath, 'utf8');
for (const control of [
  'ENABLE ROW LEVEL SECURITY',
  'RiskAssessment_immutable',
  'ApprovalDecision_immutable',
  'Invoice_approval_guard',
]) {
  if (!migration.includes(control)) failures.push(`Migration lacks ${control}`);
}
const approvals = readFileSync('apps/api/src/approvals/approvals.service.ts', 'utf8');
for (const control of [
  'SELF_APPROVAL_FORBIDDEN',
  'PASSKEY_STEP_UP_REQUIRED',
  'STALE_APPROVAL_VERSION',
  'DUPLICATE_APPROVAL_DECISION',
]) {
  if (!approvals.includes(control)) failures.push(`Approval service lacks ${control}`);
}
const webhook = readFileSync('apps/api/src/integrations/fake-bank.service.ts', 'utf8');
for (const control of ['FAKE_BANK_SIGNATURE_INVALID', 'FAKE_BANK_EVENT_ID_REUSED', 'payloadHash']) {
  if (!webhook.includes(control)) failures.push(`Webhook service lacks ${control}`);
}
const compose = readFileSync('compose.yaml', 'utf8');
for (const service of ['migrate:', 'api:', 'web:', 'worker:']) {
  if (!compose.includes(`  ${service}`)) failures.push(`Compose lacks ${service}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Milestone 0.5 structural validation passed.');
}
