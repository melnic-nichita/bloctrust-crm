# ADR-008: Hash-chained audit evidence

Status: accepted, 2026-08-27.

## Decision

Store append-only, redacted audit events with previous-event and current-event hashes per tenant stream. Describe this as tamper-evident evidence, not blockchain or perfect immutability.

## Rationale

A hash chain makes unexpected historical modification detectable while remaining simple enough to test and operate.

## Consequences

Canonical serialization and key/version rules must be stable. Authorized corrections append superseding events; they never overwrite history.
