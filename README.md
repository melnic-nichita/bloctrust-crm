# BlocTrust CRM

BlocTrust is a security-first, multi-tenant operations CRM for apartment associations and small property managers in Moldova. Its portfolio-defining workflow detects a vendor bank-account change, freezes a risky invoice, and requires two distinct step-up-verified administrators before approval.

## Current milestone: 0.4.0 secure invoice pipeline

Milestone 0.4 adds the roadmap's complete quarantine-to-review invoice path: bounded streaming
uploads, file-signature validation, private MinIO object keys, ClamAV blocking, SHA-256 duplicate
detection, Tesseract OCR suggestions, durable progress, audited short-lived downloads, and a
side-by-side reviewer workspace at `/invoices`. See [the milestone notes](docs/milestone-0.4.md).

Milestone 0.3 preserves the identity and tenant boundary from 0.2 and adds:

- buildings, apartments, dated resident occupancy, and administrator building grants;
- Vendor Trust Passports with verified contacts, tags, notes, and linked buildings;
- AES-256-GCM application encryption and append-only vendor bank-account versions;
- masked bank reads plus reasoned, step-up-protected, transactionally audited reveal;
- contracts with value limits, categories, dates, status, and document references;
- tenant-scoped search, cursor pagination, and optimistic concurrency conflicts;
- redacted vendor/contract audit events and operational dashboards;
- an administrator CRM at `http://localhost:3000/crm`.

No real payments, invoice documents, resident data, banking credentials, or production secrets
belong in this repository. All fixtures and demonstrations must remain synthetic and non-payable.

## Prerequisites

- Node.js 24+
- pnpm 10+
- Docker Desktop with Compose

## Quick start

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm infra:up` builds the isolated invoice worker with ClamAV connectivity, Tesseract, and Poppler.
`pnpm dev` starts the API and web application; keep the Docker worker running for invoice processing.

The first migration creates the non-login `bloctrust_app` database role. The local Docker database
user can create it; production migration credentials need equivalent role-management permission.

The deterministic seed account has no password and cannot sign in. Create a real synthetic local
account at `http://localhost:3000/onboarding`.

The web app runs at `http://localhost:3000`, the API at `http://localhost:3001/api/v1`, MinIO Console at `http://localhost:9001`, and Mailpit at `http://localhost:8025`.

## Health endpoints

- `GET /api/v1/health/live` - process liveness
- `GET /api/v1/health/ready` - PostgreSQL and Redis readiness
- `GET /api/v1/version` - version metadata

## Identity endpoints

- `POST /api/v1/auth/onboard` - create an organization, owner, and cookie session
- `POST /api/v1/auth/login` - password fallback login for one organization
- `POST /api/v1/auth/refresh` - rotate the one-time refresh token
- `POST /api/v1/auth/logout` and `/logout-all` - revoke one or every session
- `GET /api/v1/auth/me` - current server-side identity and tenant context
- `POST /api/v1/auth/passkeys/registration/*` - register a passkey
- `POST /api/v1/auth/step-up/*` - perform recent passkey verification
- `GET /api/v1/organizations/:organizationId` - RLS-scoped organization read
- `GET /api/v1/organizations/:organizationId/members` - role-protected membership read

## CRM endpoints

- `/api/v1/organizations/:organizationId/crm/buildings` - buildings, apartments, and access
- `/api/v1/organizations/:organizationId/crm/residents` - active residents available for occupancy
- `/api/v1/organizations/:organizationId/crm/vendors` - Vendor Trust Passports and contacts
- `/api/v1/organizations/:organizationId/crm/vendors/:vendorId/bank-accounts` - masked versions
- `/api/v1/organizations/:organizationId/crm/contracts` - scoped contract register
- `/api/v1/organizations/:organizationId/crm/dashboard` - expiry and evidence queues
- `/api/v1/organizations/:organizationId/crm/audit-events` - redacted audit timeline

PATCH requests require an `If-Match` version. Bank create, verification, and reveal routes require
recent passkey step-up; reveal also requires a reason.

All state-changing browser requests require a trusted `Origin`. Once cookies exist, the readable
CSRF cookie must also be copied into `X-CSRF-Token`.

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:security:integration
pnpm test:security:clamav
pnpm build
pnpm db:validate
pnpm validate:milestone
docker compose ps
```

## Documentation

- [Product brief](docs/product-brief.md)
- [Architecture](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Data classification](docs/data-classification.md)
- [Release backlog](docs/release-backlog.md)
- [Milestone 0.2 security design](docs/milestone-0.2.md)
- [Milestone 0.3 CRM/security design](docs/milestone-0.3.md)
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
