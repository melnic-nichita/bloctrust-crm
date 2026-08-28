# Release backlog

## Milestone 0.1 - foundation

- [x] Product brief, non-goals, hero workflow, and success criteria.
- [x] Architecture, trust boundaries, threat register, and data classification.
- [x] ADR-001 through ADR-008.
- [x] pnpm workspace and application/package skeletons.
- [x] Local infrastructure and health contracts.
- [x] Initial tenancy schema and deterministic seed design.
- [x] CI and security-scanning contracts.
- [x] Install dependencies and generate the lockfile in a network-enabled development environment.
- [ ] Run the full Docker and migration rehearsal.

## Milestone 0.2 - identity and tenant boundary

- [x] Organization creation and membership roles.
- [x] Argon2id password fallback and HIBP screening.
- [x] Cookie session rotation, reuse detection, and logout-all.
- [x] Passkey registration and recent step-up verification.
- [x] Transaction-scoped PostgreSQL RLS context.
- [x] Cross-tenant, forged-role, CSRF, and replay test suites.
- [ ] Pass the Docker migration and PostgreSQL integration-test rehearsal.

## Milestone 0.3 - CRM core

- [x] Buildings, apartments, occupancy, and building access.
- [x] Vendor Trust Passport, append-only bank accounts, and contracts.
- [x] Optimistic concurrency, scoped search, audit events, and masked reads.
- [x] Expiring-contract and incomplete-vendor dashboards.
- [x] Cross-tenant CRM, immutable-bank, reveal-audit, and stale-write tests.
- [ ] Pass the Docker migration and PostgreSQL integration-test rehearsal for the 0.3 migration.

## Milestone 0.4 - hero vertical slice

- [ ] Quarantined upload, malware scan, fingerprint, and OCR draft.
- [ ] Explainable risk rules and changed-account hold.
- [ ] Dual passkey approval with separation of duties.
- [ ] Transactional outbox, idempotent notification, and audit timeline.
- [ ] Tenant B denial test across the complete scenario.
