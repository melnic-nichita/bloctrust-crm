# Milestone 0.4 — secure invoice vertical slice

Version 0.4.0 completes the roadmap's upload-to-review path. Fraud scoring, approval policies,
payments, and the transactional outbox remain later milestones.

## Delivered path

1. The API accepts one PDF, PNG, or JPEG through a bounded disk-backed multipart stream.
2. Filename, declared MIME type, extension, file signature, non-empty size, and the 15 MiB ceiling
   are checked before persistence.
3. The object is written to the private quarantine bucket under two random UUID path segments.
4. PostgreSQL records the invoice, document, and processing progress before the deterministic
   `invoice-{invoiceId}-ingest` BullMQ job is published.
5. The worker streams the quarantined object through ClamAV. An infected result is terminally
   `BLOCKED`; OCR and approved storage are never reached.
6. Clean bytes are SHA-256 fingerprinted. Duplicate lookup is tenant-scoped and ignores the client
   filename. The clean object is copied to the approved bucket and removed from quarantine.
7. Tesseract processes an image or the first PDF page rendered by Poppler. Extracted values are
   stored only in `DocumentProcessing.suggestions`.
8. The reviewer UI displays suggestions beside independent editable draft fields. Only an explicit
   authenticated PATCH changes the invoice.
9. Approved documents use a 60-second tenant/document-bound HMAC authorization and a fresh
   database authorization check. Authorization and access are append-only audit events.

## State and failure behavior

`QUARANTINED → SCANNING → PARSED → NEEDS_REVIEW`

- Malware: `SCANNING → BLOCKED`
- Scanner, storage, or OCR failure: `MANUAL_REVIEW`
- Progress, attempts, terminal state, and suggestions live in PostgreSQL, so refreshes and worker
  restarts do not erase them.
- Queue publication failure is visible as `MANUAL_REVIEW`; it is not reported as a successful scan.

## Security invariants

- Object keys and SHA-256 values are never returned by invoice APIs.
- Every database query carries an organization predicate and all four new tables have PostgreSQL
  row-level security.
- Cross-tenant invoice and document identifiers return the same not-found response as unknown IDs.
- The worker uses parameterized SQL and never logs object keys, OCR text, or malware signatures.
- Approved object identity and fingerprint fields become immutable once assigned.
- OCR cannot transition an invoice into an approval state; version 0.4 has no approval endpoint.

## Local prerequisites

Docker builds the invoice worker with Tesseract OCR and Poppler. ClamAV can need several minutes
on its first start while signatures download.

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm test:security:integration
${env:RUN_CLAMAV_INTEGRATION} = 'true'
pnpm test:security:clamav
pnpm dev
```

`pnpm dev` starts the API and web application. Keep the containerized `worker` service running so
all OCR processing occurs in its reproducible Linux environment.

Open `http://localhost:3000/invoices`. Upload a clean synthetic invoice and verify it reaches
`NEEDS_REVIEW`. Generate the standard EICAR fixture only in a disposable local rehearsal and verify
it reaches `BLOCKED`; never disable ClamAV or commit the fixture.

## Acceptance evidence

| Roadmap acceptance              | Evidence                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| Clean document reaches review   | Worker scan, approved move, OCR, `NEEDS_REVIEW` transition        |
| Malicious document is blocked   | ClamAV `FOUND` branch; no OCR or approved move                    |
| OCR cannot overwrite records    | Suggestions use a separate JSON field; reviewer PATCH is explicit |
| Filename-independent duplicates | SHA-256 tenant lookup and integration test                        |
| No identifier existence oracle  | organization guard, RLS, scoped 404 integration test              |
| Progress survives restart       | PostgreSQL progress, attempts, heartbeat, and terminal state      |
| Object-key guessing fails       | random server-only keys and token/auth-gated downloads            |
