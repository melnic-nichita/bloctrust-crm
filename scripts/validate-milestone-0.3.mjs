import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const failures = [];

const packageJson = JSON.parse(read('package.json'));
if (packageJson.version !== '0.3.0') failures.push('Root package is not version 0.3.0');

const schema = read('prisma/schema.prisma');
for (const proof of [
  'model Building',
  'model Apartment',
  'model Occupancy',
  'model MembershipBuildingAccess',
  'model Vendor',
  'model VendorBankAccountVersion',
  'model Contract',
  'model AuditEvent',
  '@@unique([id, organizationId])',
]) {
  if (!schema.includes(proof)) failures.push(`CRM schema is missing ${proof}`);
}

const migration = read('prisma/migrations/20260828120000_crm_core/migration.sql');
for (const proof of [
  'VendorBankAccountVersion_append_only',
  'VendorBankAccountVerification_append_only',
  'AuditEvent_append_only',
  'ENABLE ROW LEVEL SECURITY',
  'Contract_tenant_boundary',
  'ContractBuilding_vendor_authorization',
  'Vendor_tenant_boundary',
  'Occupancy_dates_check',
]) {
  if (!migration.includes(proof)) failures.push(`CRM migration is missing ${proof}`);
}

const encryption = read('apps/api/src/crm/bank-encryption.service.ts');
for (const proof of ['aes-256-gcm', 'setAAD', 'getAuthTag', 'accountFingerprint']) {
  if (!encryption.includes(proof)) failures.push(`Bank encryption is missing ${proof}`);
}

const services = [
  'apps/api/src/crm/buildings.service.ts',
  'apps/api/src/crm/vendors.service.ts',
  'apps/api/src/crm/contracts.service.ts',
  'apps/api/src/crm/dashboard.service.ts',
];
for (const path of services) read(path);

for (const path of [
  'tests/security/bank-encryption.spec.ts',
  'tests/security/concurrency.spec.ts',
  'tests/security/crm-core.integration.spec.ts',
]) {
  read(path);
}

const vendorController = read('apps/api/src/crm/vendors.controller.ts');
if (!vendorController.includes('@RequireRecentStepUp()')) {
  failures.push('Restricted bank routes do not require recent step-up');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.info('BlocTrust Milestone 0.3 validation passed.');
}
