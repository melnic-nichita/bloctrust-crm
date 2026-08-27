# ADR-003: Organization scope and PostgreSQL RLS

Status: accepted, 2026-08-27.

## Decision

Every tenant-owned row carries `organizationId`. Application policies authorize resources, while transaction-scoped PostgreSQL Row-Level Security supplies defense in depth.

## Rationale

Application filtering alone is easy to omit. RLS limits the impact of a repository/query bug without replacing use-case authorization.

## Consequences

Database work must run through an organization-context transaction. Integration tests require a real PostgreSQL database and fixtures for at least two organizations.
