# Local environment rehearsal

## Fully containerized path

1. Copy `.env.example` to `.env` and keep all values synthetic and development-only.
2. Run `pnpm docker:validate` and `pnpm docker:up`.
3. Run `docker compose ps -a`. The `migrate` container must exit with code 0; `api`, `web`,
   PostgreSQL, Redis, MinIO, and ClamAV must be healthy; `worker` must be running.
4. Open `http://localhost:3000/onboarding` and create a synthetic local organization.
5. Inspect `http://localhost:3001/api/v1/health/ready`, then exercise `/invoices` and `/approvals`.
6. Follow operational output with `pnpm docker:logs`.
7. Stop with `pnpm docker:down`. Add `-v` only when intentionally deleting all local data.

## Hybrid development path

1. Copy `.env.example` to `.env` and keep all values development-only.
2. Run `pnpm install` and confirm the lockfile is unchanged.
3. Run `pnpm infra:up` to build and start the OCR worker with PostgreSQL, Redis, MinIO, ClamAV,
   and Mailpit.
4. Wait for ClamAV signature initialization, then inspect `docker compose ps`; the `worker`
   container must be running before an invoice is uploaded.
5. Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed` twice.
6. Run `pnpm test:security:integration`; confirm the identity, CRM, invoice, and document
   cross-tenant attacks, refresh replay, immutable bank history, reveal audit, suggestion
   separation, and stale-write tests pass.
7. Run `pnpm dev` for the API and web application. The containerized worker supplies ClamAV and
   Tesseract processing. Create a synthetic organization in `/onboarding`, and register a passkey
   in `/security`.
8. Open `/crm`; create a synthetic building, apartment, resident occupancy, Vendor Trust Passport,
   second encrypted bank version, and contract. Confirm lists show only masked bank data.
9. Open `/invoices`; upload a clean synthetic PDF and confirm progress survives a refresh, the
   document reaches `NEEDS_REVIEW`, suggestions remain separate, and preview authorization expires.
10. Set `RUN_CLAMAV_INTEGRATION=true`, run `pnpm test:security:clamav`, and confirm the harmless
    antivirus test signature is blocked. Upload an oversized or signature-mismatched file and
    confirm it is rejected before a database record is created.
11. Inspect liveness, readiness, version, login, refresh rotation, and logout-all behavior.
12. Stop Redis and confirm readiness returns 503 while liveness remains 200.
13. Restart Redis and confirm readiness recovers.
14. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
    `pnpm validate:milestone`.
15. Run `docker compose down`; use `-v` only when deliberately deleting local development data.
