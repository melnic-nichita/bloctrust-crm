# ADR-002: HttpOnly cookie sessions

Status: accepted, 2026-08-27.

## Decision

Use short access sessions and rotated refresh tokens in Secure, HttpOnly, SameSite cookies. Apply CSRF tokens, Origin checks, token-family reuse detection, and recent passkey step-up for sensitive actions.

## Rationale

HttpOnly cookies reduce token exposure to browser JavaScript while explicit CSRF defenses address ambient cookie authority.

## Consequences

CORS, trusted origins, proxy configuration, and cookie behavior must be tested together. Mobile clients may later use a separate token transport under the same server-side session model.
