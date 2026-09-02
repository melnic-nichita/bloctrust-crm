# ADR-011: Explainable risk and separation of duties

## Status

Accepted for milestone 0.5.

## Decision

Invoice approval uses a deterministic, versioned rules engine. Every assessment persists its input
facts, individual rule contributions, total, level, policy version, and a canonical evidence hash.
Organization policies define low and high score thresholds without changing historical results.

An approval request is bound to an immutable invoice version, risk assessment, and vendor bank
account version. Medium-risk invoices need one decision; high-risk invoices need two decisions by
distinct eligible memberships. The initiator cannot approve their own request, and every decision
requires a recent passkey step-up verified from the server-side session record.

Editing an invoice or creating a new vendor bank-account version invalidates pending requests. The
database independently prevents an invoice from entering `APPROVED` without a current satisfied
request. Decisions and risk assessments are append-only evidence.

The fake-bank integration accepts only timestamped HMAC-signed webhooks, stores the event ID and
payload hash, and treats an exact replay as a successful no-op. Reusing an event ID for different
content is rejected.

## Consequences

- Reviewers can reproduce and explain a score without rerunning mutable rules.
- Compromising one administrator session cannot satisfy a high-risk approval.
- A stale decision cannot authorize edited invoice or bank data.
- The development adapter exercises production-shaped signature and replay controls without moving
  real money.
