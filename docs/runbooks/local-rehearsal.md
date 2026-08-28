# Local environment rehearsal

1. Copy `.env.example` to `.env` and keep all values development-only.
2. Run `pnpm install` and confirm the lockfile is unchanged.
3. Run `docker compose up -d postgres redis minio clamav mailpit`.
4. Wait for ClamAV signature initialization, then inspect `docker compose ps`.
5. Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed` twice.
6. Run `pnpm test:security:integration`; confirm the cross-tenant reads/updates and refresh replay
   tests pass against PostgreSQL.
7. Run `pnpm dev`, create a synthetic organization in `/onboarding`, and register a passkey in
   `/security`.
8. Inspect liveness, readiness, version, login, refresh rotation, and logout-all behavior.
9. Stop Redis and confirm readiness returns 503 while liveness remains 200.
10. Restart Redis and confirm readiness recovers.
11. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
    `pnpm validate:milestone`.
12. Run `docker compose down`; use `-v` only when deliberately deleting local development data.
