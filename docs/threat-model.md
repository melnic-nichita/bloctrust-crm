# Threat model

Status: initial design baseline for Milestone 0.1. Revisit at every phase exit.

## Protected assets

- Tenant membership and authorization state.
- Session, passkey, recovery, and step-up verification state.
- Vendor identity and bank-account history.
- Invoice documents, extracted fields, decisions, and exports.
- Resident contact, occupancy, incident, and meter information.
- Audit evidence, workflow state, encryption keys, and backups.

## Actors

- Authorized owner, administrator, accountant, resident, contractor, and auditor.
- Authenticated member attempting privilege escalation or another tenant's data.
- Anonymous attacker, compromised account, malicious uploader, and spoofed integration.
- Operator with database/storage access and a failed or duplicated worker.

## STRIDE register

| ID   | Threat                                    | Boundary/asset       | Control                                                                | Required verification                             | Owner        | Status  |
| ---- | ----------------------------------------- | -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- | ------------ | ------- |
| S-01 | Forged role or step-up claim              | API authorization    | Load membership and recent verification server-side; DTO allowlist     | Submit admin/verified fields from a resident      | Identity     | Planned |
| S-02 | Spoofed/replayed webhook                  | Integration endpoint | HMAC, timestamp window, nonce, idempotency key                         | Invalid signature and duplicate payload           | Integrations | Planned |
| T-01 | Invoice or approval edited after decision | Financial state      | Version checks, state machine, new approval version                    | Approve stale entity version                      | Approvals    | Planned |
| T-02 | Audit row modified                        | Audit evidence       | Append-only permissions and hash chain                                 | Attempt update/delete and chain verification      | Audit        | Planned |
| R-01 | Administrator denies sensitive action     | Approval/audit       | Actor, correlation, causation, timestamp, reason, evidence hash        | Reconstruct hero workflow                         | Audit        | Planned |
| I-01 | Cross-tenant IDOR                         | All tenant records   | Organization scope, resource policy, PostgreSQL RLS                    | Read/update every route as Tenant B               | Platform     | Planned |
| I-02 | Document/object-key disclosure            | Object storage       | Random keys, fresh authorization, short signed URLs                    | Guess key and reuse expired URL                   | Documents    | Planned |
| I-03 | Sensitive data in logs/export             | Telemetry/export     | Field redaction, masked defaults, CSV hardening                        | Log capture and formula-injection fixtures        | Platform     | Planned |
| D-01 | Oversized/malicious upload                | API/worker/storage   | Stream limits, signature checks, quarantine, ClamAV                    | EICAR, polyglot, double extension, oversized file | Documents    | Planned |
| D-02 | Queue retry storm                         | Redis/worker         | Bounded retry, exponential backoff, dead-letter view                   | Kill worker mid-job                               | Workflows    | Planned |
| E-01 | Self-approval or duplicate approver       | High-risk invoice    | Eligible-user policy, separation of duties, unique decision constraint | Initiator and repeated-user decisions             | Approvals    | Planned |
| E-02 | Realtime room escalation                  | Building channel     | Reauthorize socket, room join, and mutation                            | Join another building room                        | Community    | Planned |

## Security assumptions

- Production secrets are supplied outside the repository and rotated after rehearsal.
- The deployment uses TLS and correctly configured trusted proxies.
- The host and container runtime are patched and access-controlled.
- Synthetic data is used for every public demo.

## Abuse cases that must become tests

1. A resident sends an administrator role in a request body.
2. Tenant B requests Tenant A's building, vendor, invoice, document, and audit identifiers.
3. A stolen refresh token is replayed after rotation.
4. A cross-origin request attempts a cookie-authenticated state change.
5. A renamed duplicate invoice and an EICAR fixture are uploaded.
6. A vendor bank account changes immediately before invoice approval.
7. An initiator tries to produce both high-risk approval decisions.
8. The same outbox event and webhook are delivered twice.
9. A resident attempts to join another building's Socket.IO room.

## Exit rule

No threat may be marked mitigated until a control exists and its linked automated or repeatable manual verification passes. Accepted risks require explicit rationale, owner, and review date.
