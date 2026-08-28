# Milestone 0.2: identity and tenant boundary

Status: implementation complete; local PostgreSQL integration rehearsal pending.

## Security properties

### Password fallback

- Node.js 24's built-in Argon2id implementation uses a random 16-byte salt, 19 MiB memory, two
  passes, one lane, and a 32-byte output by default.
- Passwords are SHA-1 hashed only for HIBP's Pwned Passwords range protocol. Only the first five
  hexadecimal characters leave the API, and `Add-Padding: true` reduces response-size leakage.
- Onboarding fails closed with HTTP 503 if exposure screening cannot complete and rejects a known
  exposed password with HTTP 422.

### Cookie sessions

- The 15-minute access cookie is HMAC-signed and contains no role or step-up claim.
- The opaque 30-day refresh token is stored only as SHA-256 and may be consumed once.
- Rotation creates a new token record. Replaying a consumed record revokes every session and token
  in its family before the API returns HTTP 401.
- Access, refresh, and CSRF cookies use `SameSite=Strict`; production names use the `__Host-`
  prefix and `Secure`.
- State-changing requests require an exact trusted Origin. Cookie-authenticated requests also need
  a constant-time double-submit CSRF match.

### Passkeys and step-up

- SimpleWebAuthn verifies registration and authentication against the configured RP ID and exact
  web origin with user verification required.
- Challenges are database-backed, expire after five minutes, and are atomically consumed once.
- The first passkey requires a login from the previous ten minutes; adding another requires recent
  verification with an existing passkey.
- Credential counters and backup state are updated after authentication.
- Successful step-up is recorded on the server-side session and is recent for five minutes.

### Tenant boundary

- The authenticated organization identifier comes from a signed session and is checked against an
  active membership loaded from PostgreSQL.
- `TenantDatabaseService.run` assumes the non-login `bloctrust_app` role and sets
  `app.organization_id` only for the current transaction.
- RLS policies cover organizations, memberships, invitations, and membership-visible users.
- The path guard returns 404 when a member substitutes another organization identifier; RLS remains
  the database-level backstop if that application check is omitted.

## Verification

Run the complete phase exit locally:

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm test
pnpm test:security:integration
pnpm lint
pnpm typecheck
pnpm build
pnpm validate:milestone
```

The PostgreSQL suites create two synthetic tenants, attempt cross-tenant reads and writes under the
application role, then replay a consumed refresh token and confirm that its complete family was
revoked.
