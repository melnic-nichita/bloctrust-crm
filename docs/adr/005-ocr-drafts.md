# ADR-005: OCR produces drafts only

Status: accepted, 2026-08-27.

## Decision

OCR output is stored as attributed suggestions with confidence and source evidence. A human reviewer owns the canonical financial record.

## Rationale

OCR is fallible and must not silently change amounts, bank accounts, vendors, or approval state.

## Consequences

The reviewer UI preserves the original document beside editable fields and records who accepted or changed each suggestion.
