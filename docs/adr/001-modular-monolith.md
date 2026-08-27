# ADR-001: Modular monolith before microservices

Status: accepted, 2026-08-27.

## Decision

Use one repository and shared PostgreSQL domain model with separately runnable web, API, and worker applications. Enforce module boundaries in code and tests.

## Rationale

One developer can preserve transactional invariants, deliver a demonstrable vertical slice, and avoid distributed-system overhead. Modules and the outbox preserve a later extraction path.

## Consequences

Cross-module access needs explicit contracts. Scaling is initially per application process rather than per domain service.
