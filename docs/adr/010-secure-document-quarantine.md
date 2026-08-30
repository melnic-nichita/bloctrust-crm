# ADR-010: Private quarantine and reviewer-controlled OCR

- Status: Accepted
- Date: 2026-08-29

## Decision

Invoice source files enter a private quarantine bucket under cryptographically random keys. A
separate worker must obtain a clean ClamAV result before copying bytes to the approved bucket.
SHA-256 fingerprints are assigned only after that gate. Tesseract output is stored as suggestions
beside, never inside, the invoice's editable financial fields.

Downloads remain API-mediated. The API performs tenant and role authorization, issues a 60-second
HMAC token bound to both tenant and document, repeats authorization when serving bytes, and writes
append-only audit events.

## Consequences

- A storage or OCR outage is fail-closed into manual review rather than silent acceptance.
- Storage credentials never reach the browser.
- Quarantine and approved lifecycle/retention policies must be configured operationally.
- Multi-page OCR accuracy can be extended later without changing the trust boundary.
