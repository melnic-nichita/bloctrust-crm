# ADR-006: No real payment processing

Status: accepted, 2026-08-27.

## Decision

Version 1 records invoice review and payment status but never processes payouts, stores card data, or stores banking credentials.

## Rationale

The portfolio value is authorization, fraud resistance, reliable workflows, and evidence. Real payments add regulatory and operational risk without strengthening that proof.

## Consequences

Any bank-status integration is a clearly labeled fake adapter using synthetic, signed webhook fixtures.
