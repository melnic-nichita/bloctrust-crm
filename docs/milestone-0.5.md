# Milestone 0.5 — explainable risk and dual approval

Version 0.5.0 completes the roadmap's risk-to-approval slice. It does not initiate real payments.

The release is fully containerized: Compose builds dedicated non-root API, web, and OCR worker
images, runs migrations as a one-shot dependency, and gates application startup on infrastructure
and API health.

## Delivered path

1. A reviewed invoice is submitted with an idempotency key.
2. The API snapshots invoice, contract, duplicate fingerprint, amount, and current vendor-bank facts.
3. The versioned deterministic engine stores every fact and weighted contribution plus a canonical
   SHA-256 evidence hash.
4. Organization-specific low/high thresholds classify the result and select one or two required
   decisions.
5. A changed vendor bank account contributes the strongest signal and freezes the invoice in
   `AWAITING_APPROVAL`.
6. Eligible administrators see the score, explanation, evidence references, and immutable request
   version in `/approvals`.
7. Every decision is bound to a distinct membership and a recent passkey-verified server session.
8. A rejection is reasoned and terminal. Enough approvals move the current invoice version to
   `APPROVED`.
9. Invoice edits and new bank-account versions invalidate pending requests and require fresh risk
   evidence.
10. A signed fake-bank webhook updates the selected bank version once; exact delivery replays are
    successful no-ops and conflicting replays are rejected.

## Security invariants

- The initiator cannot approve their own request.
- One membership cannot contribute two decisions to a request.
- High risk requires two distinct eligible approvers.
- Client assertions cannot forge passkey step-up; the database session timestamp is authoritative.
- Requests are version-bound, and stale requests cannot approve an edited invoice.
- Risk facts, contributions, and decisions are immutable and tenant-isolated with PostgreSQL RLS.
- Webhook signatures cover the timestamp and canonical payload; timestamps have a five-minute
  acceptance window.
- No route sends money or stores real banking credentials.

## Local rehearsal

Run the complete application in Docker:

```powershell
Copy-Item .env.example .env
pnpm docker:validate
pnpm docker:up
docker compose ps
```

The `migrate` service should show `Exited (0)` and `api`, `web`, PostgreSQL, Redis, MinIO, and
ClamAV should become healthy. Use `pnpm docker:logs` to follow the application containers.

For hybrid development with the API and web running on the host:

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm test:security:integration
pnpm dev
```

Create two distinct local administrator memberships and register a passkey for each. Upload and
review a synthetic invoice, create a replacement synthetic bank version, submit the invoice at
`http://localhost:3000/invoices`, and complete the decisions at
`http://localhost:3000/approvals`. Never use a real IBAN or payable document.

## Acceptance evidence

| Roadmap acceptance                             | Evidence                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Changed IBAN raises score and freezes invoice  | `BANK_ACCOUNT_CHANGED` contribution and `AWAITING_APPROVAL` transition |
| Initiator cannot supply approvals              | service separation check plus integration assertion                    |
| High risk needs two distinct passkey decisions | membership uniqueness, recent-session check, and request threshold     |
| Editing invalidates approval                   | invoice version bump and pending-request invalidation                  |
| Risk is reproducible                           | persisted facts/contributions/rule version and canonical evidence hash |
| Duplicate webhook is processed once            | unique tenant/event ID, payload hash comparison, and replay test       |
| Forged step-up and duplicate decisions fail    | abuse-focused PostgreSQL integration suite                             |
