# ADR-007: Replaceable connector capabilities

Status: accepted, 2026-08-27.

## Decision

External providers implement narrow capability interfaces with availability detection and manual/file fallback.

## Rationale

Free tiers, Moldova utility access, and provider terms can change. Core CRM workflows must remain usable without any single external service.

## Consequences

Adapters require contract tests, timeouts, caching/rate limits, minimal payloads, and degraded-mode behavior.
