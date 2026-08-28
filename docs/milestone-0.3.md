# Milestone 0.3: CRM core

Status: implementation complete; local PostgreSQL/Docker rehearsal pending.

## Delivered relationship graph

- Buildings, apartments, dated occupancies, and explicit membership-to-building grants.
- Vendor Trust Passports with verified contacts, tags, internal notes, and authorized buildings.
- Contracts with vendor/building relationships, service category, value limit, dates, status, and a
  document reference that does not bypass the quarantined upload work planned for 0.4.
- Tenant-scoped search and cursor pagination. Search responses intentionally omit global totals.
- Dashboards for contracts expiring within 60 days and incomplete vendor evidence.

## Security properties

### Tenant and building boundaries

Every new table carries `organizationId` and has a PostgreSQL RLS policy for the non-login
`bloctrust_app` role. Composite foreign keys use both the resource ID and organization ID, so a
cross-tenant relationship fails even if application authorization is accidentally omitted.

Owners may manage every building in their organization. Administrators can link residents,
vendors, and contracts only to buildings covered by a current `MembershipBuildingAccess` grant.
The API resolves membership ID and role from the authenticated server-side session.

### Restricted bank fields

Full account number, account holder, and bank name are serialized and protected with AES-256-GCM.
The organization and vendor identifiers are authenticated additional data, preventing ciphertext
from being moved to a different tenant or vendor. Separate HKDF-derived encryption and HMAC keys
support authenticated encryption and a blind equality fingerprint.

Normal API responses select only the mask, holder mask, country, key ID, version, and verification
history. A full reveal requires an eligible server-side role, recent passkey step-up, and a reason.
The reveal and its redacted audit event commit in one transaction; audit failure prevents response.

Bank versions and verification statements are append-only at both the database permission and
trigger layers. A new account value creates the next version rather than updating prior evidence.

### Conflicts and audit

Building, vendor, and contract edits require an `If-Match` version. Updates match both ID and
version and increment atomically; a stale editor receives HTTP 409 instead of overwriting data.

Vendor and contract creates/updates write redacted before/after audit snapshots. Bank audit events
contain masks and metadata only. Audit rows are append-only and carry actor membership,
correlation ID, action, entity, reason, and timestamp.

## Verification

```bash
cp .env.example .env
pnpm install --frozen-lockfile
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

The CRM integration suite creates two tenants and proves tenant-scoped search, cross-tenant
relationship rejection, append-only bank history, masked defaults, reasoned reveal auditing, and
stale-write conflicts.
