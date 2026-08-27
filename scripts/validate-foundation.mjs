import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const failures = [];

for (const path of [
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/worker/package.json',
  'packages/domain/package.json',
  'packages/ui/package.json',
  'packages/config/package.json',
]) {
  const manifest = JSON.parse(read(path));
  if (!manifest.name?.startsWith('@bloctrust/')) {
    failures.push(`${path} must use the @bloctrust namespace`);
  }
}

const schema = read('prisma/schema.prisma');
for (const model of ['User', 'Organization', 'Membership', 'Invitation', 'Session']) {
  if (!schema.includes(`model ${model} {`)) failures.push(`Missing Prisma model: ${model}`);
}

const threatModel = read('docs/threat-model.md');
for (const proof of ['Cross-tenant IDOR', 'Spoofed/replayed webhook', 'Self-approval']) {
  if (!threatModel.includes(proof)) failures.push(`Missing threat proof: ${proof}`);
}

const compose = read('compose.yaml');
for (const service of ['postgres:', 'redis:', 'minio:', 'clamav:', 'mailpit:']) {
  if (!compose.includes(service)) failures.push(`Missing Compose service: ${service}`);
}
if (compose.includes(':latest')) failures.push('Compose images must not use the latest tag');

const workflow = read('.github/workflows/ci.yml');
for (const gate of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build']) {
  if (!workflow.includes(gate)) failures.push(`Missing CI gate: ${gate}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.info('BlocTrust foundation validation passed.');
}
