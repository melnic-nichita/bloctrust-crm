# Security regression tests

Attack tests are organized by control, not by penetration-testing narrative. Every fixture must be synthetic and safe for a public repository.

Milestone 0.2 automated suites:

- `tenant-boundary.integration.spec.ts` - Tenant B reads/updates from a Tenant A RLS transaction.
- `forged-role.spec.ts` - client-supplied role and step-up claims.
- `session-replay.integration.spec.ts` - consumed refresh-token family replay.
- `csrf.spec.ts` - cross-origin and mismatched-token mutations.
- `session-token.spec.ts` - signed access-cookie tenant forgery.
- `pwned-password.spec.ts` - HIBP k-anonymity and response-padding contract.
- `password.spec.ts` - Argon2id encoding and verification contract.
- `step-up.spec.ts` - recent server-side passkey verification window.

Milestone 0.3 automated suites:

- `crm-core.integration.spec.ts` - tenant-scoped CRM search, cross-tenant relationships, masked and
  immutable bank versions, audited reveal, and stale-write conflict.
- `bank-encryption.spec.ts` - AES-GCM round trip and tenant/vendor ciphertext binding.
- `audit-redaction.spec.ts` - restricted fields excluded from vendor/contract snapshots.
- `concurrency.spec.ts` - `If-Match` parsing and HTTP 409 stale-write behavior.

Future suites:

- `uploads` - EICAR, oversized, double-extension, signature mismatch, and key guessing.
- `approval-abuse` - self-approval, stale versions, duplicate decisions, and webhook replay.
- `realtime` - unauthorized channel joins and message-object reassignment.

Do not place active credentials or unencoded malware in fixtures. The EICAR string belongs only in a purpose-specific fixture and its scanner assertion.
