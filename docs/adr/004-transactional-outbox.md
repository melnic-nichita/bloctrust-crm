# ADR-004: Transactional outbox

Status: accepted, 2026-08-27.

## Decision

Write domain state and an outbox event in one PostgreSQL transaction. A relay publishes deterministic BullMQ jobs; handlers record idempotent workflow outcomes and bounded retries.

## Rationale

This prevents a successful domain write from losing its required asynchronous work and makes duplicate delivery safe and observable.

## Consequences

Events require schemas, correlation/causation identifiers, unique idempotency keys, cleanup policy, and a dead-letter operations view.
