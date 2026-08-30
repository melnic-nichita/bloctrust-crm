import { readFileSync, existsSync } from 'node:fs';

const failures = [];
const migrationPath = 'prisma/migrations/20260829120000_secure_invoice_pipeline/migration.sql';
const required = [
  '.dockerignore',
  migrationPath,
  'apps/api/src/invoices/invoices.controller.ts',
  'apps/api/src/invoices/document-validation.ts',
  'apps/worker/src/invoice-pipeline.ts',
  'apps/worker/Dockerfile',
  'apps/worker/src/clamav.ts',
  'apps/worker/src/ocr.ts',
  'apps/web/app/invoices/page.tsx',
  'tests/security/document-validation.spec.ts',
  'tests/security/clamav.integration.spec.ts',
  'tests/security/invoice-pipeline.integration.spec.ts',
  'docs/adr/010-secure-document-quarantine.md',
  'docs/milestone-0.4.md',
];
for (const file of required) if (!existsSync(file)) failures.push(`Missing ${file}`);

const root = JSON.parse(readFileSync('package.json', 'utf8'));
if (root.version !== '0.4.0') failures.push('Root package version must be 0.4.0');
const schema = readFileSync('prisma/schema.prisma', 'utf8');
for (const model of ['Invoice', 'InvoiceLine', 'Document', 'DocumentProcessing']) {
  if (!schema.includes(`model ${model} {`)) failures.push(`Missing Prisma model ${model}`);
}
const migration = readFileSync(migrationPath, 'utf8');
for (const control of [
  'ENABLE ROW LEVEL SECURITY',
  'Document_identity_immutable',
  'DocumentProcessing_valid_transition',
  'Invoice_contract_vendor',
]) {
  if (!migration.includes(control)) failures.push(`Migration lacks ${control}`);
}
const worker = readFileSync('apps/worker/src/invoice-pipeline.ts', 'utf8');
for (const control of ['scanFile', 'hashFile', 'extractSuggestions', 'duplicateOfDocumentId']) {
  if (!worker.includes(control)) failures.push(`Worker lacks ${control}`);
}
const workerDockerfile = readFileSync('apps/worker/Dockerfile', 'utf8');
if (workerDockerfile.includes('COPY apps/worker apps/worker')) {
  failures.push('Worker Dockerfile must not overwrite installed pnpm links with host files');
}
for (const control of [
  'COPY apps/worker/src apps/worker/src',
  'COPY apps/worker/tsconfig.json apps/worker/tsconfig.json',
]) {
  if (!workerDockerfile.includes(control)) failures.push(`Worker Dockerfile lacks ${control}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Milestone 0.4 structural validation passed.');
}
