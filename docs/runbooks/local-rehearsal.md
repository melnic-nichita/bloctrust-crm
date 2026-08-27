# Local environment rehearsal

1. Copy `.env.example` to `.env` and keep all values development-only.
2. Run `pnpm install` and confirm the lockfile is unchanged.
3. Run `docker compose up -d postgres redis minio clamav mailpit`.
4. Wait for ClamAV signature initialization, then inspect `docker compose ps`.
5. Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed` twice.
6. Run `pnpm dev` and inspect liveness, readiness, and version endpoints.
7. Stop Redis and confirm readiness returns 503 while liveness remains 200.
8. Restart Redis and confirm readiness recovers.
9. Run quality and security checks.
10. Run `docker compose down`; use `-v` only when deliberately deleting local development data.
