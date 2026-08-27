# BlocTrust CRM

BlocTrust is a security-first, multi-tenant operations CRM for apartment associations and small property managers in Moldova. Its portfolio-defining workflow detects a vendor bank-account change, freezes a risky invoice, and requires two distinct step-up-verified administrators before approval.

## Current milestone: 0.1.0 foundation

This starter contains:

- the pnpm monorepo structure for Next.js, NestJS, a worker, and shared packages;
- Docker Compose services for PostgreSQL, Redis, MinIO, ClamAV, and Mailpit;
- API liveness, readiness, and version endpoints;
- an initial Prisma tenancy model and deterministic seed;
- the product brief, threat model, data classification, eight ADRs, and release backlog;
- CI contracts for quality, tests, migrations, secrets, static analysis, and container scanning.

No real payments, invoices, resident data, banking credentials, or production secrets belong in this repository.

## Prerequisites

- Node.js 24+
- pnpm 10+
- Docker Desktop with Compose

## Quick start

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis minio clamav mailpit
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Commit the generated `pnpm-lock.yaml` after the first successful install, then change CI installs to `--frozen-lockfile`.

The web app runs at `http://localhost:3000`, the API at `http://localhost:3001/api/v1`, MinIO Console at `http://localhost:9001`, and Mailpit at `http://localhost:8025`.

## Health endpoints

- `GET /api/v1/health/live` - process liveness
- `GET /api/v1/health/ready` - PostgreSQL and Redis readiness
- `GET /api/v1/version` - version metadata

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:validate
docker compose ps
```

## Documentation

- [Product brief](docs/product-brief.md)
- [Architecture](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Data classification](docs/data-classification.md)
- [Release backlog](docs/release-backlog.md)
- [Architecture decisions](docs/adr/README.md)

## First vertical slice

1. Administrator A creates an organization, building, vendor, and contract.
2. Administrator A invites Administrator B and registers a passkey.
3. A safe invoice passes quarantine and becomes a human-reviewable draft.
4. A changed vendor bank account raises the risk score and freezes approval.
5. Administrator A cannot supply both decisions.
6. Administrator B performs step-up verification and completes approval.
7. The audit timeline connects each transition by correlation ID.
8. A second tenant cannot read any object in the scenario.

See [CONTRIBUTING.md](CONTRIBUTING.md) before implementing a module.
