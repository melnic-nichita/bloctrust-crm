import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const failures = [];

const schema = read('prisma/schema.prisma');
for (const proof of [
  'passwordHash',
  'SessionRefreshToken',
  'PasskeyChallenge',
  'stepUpVerifiedAt',
]) {
  if (!schema.includes(proof)) failures.push(`Schema is missing ${proof}`);
}

const migration = read('prisma/migrations/20260827210000_identity_tenant_boundary/migration.sql');
for (const proof of [
  'ENABLE ROW LEVEL SECURITY',
  'bloctrust_app',
  "current_setting('app.organization_id'",
]) {
  if (!migration.includes(proof)) failures.push(`RLS migration is missing ${proof}`);
}

const authFiles = [
  'apps/api/src/identity/password.service.ts',
  'apps/api/src/identity/pwned-password.service.ts',
  'apps/api/src/identity/session.service.ts',
  'apps/api/src/identity/passkey.service.ts',
  'apps/api/src/common/csrf.service.ts',
];
for (const path of authFiles) read(path);

for (const path of [
  'tests/security/forged-role.spec.ts',
  'tests/security/csrf.spec.ts',
  'tests/security/session-replay.integration.spec.ts',
  'tests/security/tenant-boundary.integration.spec.ts',
]) {
  read(path);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.info('BlocTrust Milestone 0.2 validation passed.');
}
