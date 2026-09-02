import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const required = [
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  'apps/worker/Dockerfile',
  'compose.yaml',
];
for (const file of required) if (!existsSync(file)) failures.push(`Missing ${file}`);

const compose = readFileSync('compose.yaml', 'utf8');
for (const service of [
  'postgres:',
  'redis:',
  'minio:',
  'clamav:',
  'mailpit:',
  'migrate:',
  'api:',
  'web:',
  'worker:',
]) {
  if (!compose.includes(`  ${service}`)) failures.push(`Compose lacks ${service}`);
}
for (const control of [
  'condition: service_healthy',
  'condition: service_completed_successfully',
  'target: migration',
  "'3000:3000'",
  "'3001:3001'",
  'COOKIE_SECURE:',
]) {
  if (!compose.includes(control)) failures.push(`Compose lacks ${control}`);
}

const apiDockerfile = readFileSync('apps/api/Dockerfile', 'utf8');
for (const control of [
  'FROM node:24-bookworm-slim AS build',
  'pnpm install --frozen-lockfile',
  'pnpm db:generate',
  'FROM build AS migration',
  'USER node',
]) {
  if (!apiDockerfile.includes(control)) failures.push(`API Dockerfile lacks ${control}`);
}

const webDockerfile = readFileSync('apps/web/Dockerfile', 'utf8');
for (const control of [
  'ARG NEXT_PUBLIC_API_URL',
  'pnpm --filter @bloctrust/web build',
  '/app/apps/web/.next/standalone',
  'USER node',
]) {
  if (!webDockerfile.includes(control)) failures.push(`Web Dockerfile lacks ${control}`);
}

const nextConfig = readFileSync('apps/web/next.config.ts', 'utf8');
if (!nextConfig.includes("output: 'standalone'")) {
  failures.push('Next.js must emit a standalone container runtime');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Container structure validation passed.');
}
