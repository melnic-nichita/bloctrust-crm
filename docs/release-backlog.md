# Release backlog

## Milestone 0.1 - foundation

- [x] Product brief, non-goals, hero workflow, and success criteria.
- [x] Architecture, trust boundaries, threat register, and data classification.
- [x] ADR-001 through ADR-008.
- [x] pnpm workspace and application/package skeletons.
- [x] Local infrastructure and health contracts.
- [x] Initial tenancy schema and deterministic seed design.
- [x] CI and security-scanning contracts.
- [ ] Install dependencies and generate the lockfile in a network-enabled development environment.
- [ ] Run the full Docker and migration rehearsal.

## Milestone 0.2 - identity and tenant boundary

- [ ] Organization creation and membership roles.
- [ ] Argon2id password fallback and HIBP screening.
- [ ] Cookie session rotation, reuse detection, and logout-all.
- [ ] Passkey registration and recent step-up verification.
- [ ] Transaction-scoped PostgreSQL RLS context.
- [ ] Cross-tenant, forged-role, CSRF, and replay tests.

## Milestone 0.3 - CRM core

- [ ] Buildings, apartments, occupancy, and building access.
- [ ] Vendor Trust Passport, append-only bank accounts, and contracts.
- [ ] Optimistic concurrency, scoped search, audit events, and masked reads.

## Milestone 0.4 - hero vertical slice

- [ ] Quarantined upload, malware scan, fingerprint, and OCR draft.
- [ ] Explainable risk rules and changed-account hold.
- [ ] Dual passkey approval with separation of duties.
- [ ] Transactional outbox, idempotent notification, and audit timeline.
- [ ] Tenant B denial test across the complete scenario.
