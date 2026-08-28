# Local environment rehearsal

1. Copy `.env.example` to `.env` and keep all values development-only.
2. Run `pnpm install` and confirm the lockfile is unchanged.
3. Run `docker compose up -d postgres redis minio clamav mailpit`.
4. Wait for ClamAV signature initialization, then inspect `docker compose ps`.
5. Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed` twice.
6. Run `pnpm test:security:integration`; confirm the identity and CRM cross-tenant attacks,
   refresh replay, immutable bank history, reveal audit, and stale-write tests pass.
7. Run `pnpm dev`, create a synthetic organization in `/onboarding`, and register a passkey in
   `/security`.
8. Open `/crm`; create a synthetic building, apartment, resident occupancy, Vendor Trust Passport,
   second encrypted bank version, and contract. Confirm lists show only masked bank data.
9. Inspect liveness, readiness, version, login, refresh rotation, and logout-all behavior.
10. Stop Redis and confirm readiness returns 503 while liveness remains 200.
11. Restart Redis and confirm readiness recovers.
12. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
    `pnpm validate:milestone`.
13. Run `docker compose down`; use `-v` only when deliberately deleting local development data.
