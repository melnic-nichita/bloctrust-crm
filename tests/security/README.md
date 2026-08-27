# Security regression tests

Attack tests are organized by control, not by penetration-testing narrative. Every fixture must be synthetic and safe for a public repository.

Initial suites:

- `tenant-isolation` - Tenant B reads/updates each Tenant A resource.
- `role-forgery` - client-supplied role and step-up claims.
- `session-replay` - rotated refresh-token family replay.
- `csrf` - cross-origin cookie-authenticated mutations.
- `uploads` - EICAR, oversized, double-extension, signature mismatch, and key guessing.
- `approval-abuse` - self-approval, stale versions, duplicate decisions, and webhook replay.
- `realtime` - unauthorized channel joins and message-object reassignment.

Do not place active credentials or unencoded malware in fixtures. The EICAR string belongs only in a purpose-specific fixture and its scanner assertion.
