# ADR-009: application encryption for vendor bank fields

## Status

Accepted for Milestone 0.3.

## Context

Database and storage encryption protect media and backups but do not prevent an operator or a SQL
read path from seeing vendor bank details. The roadmap requires full bank data to be encrypted at
the application layer, masked by default, and audited whenever revealed.

## Decision

The API encrypts a versioned JSON payload containing account number, account holder, and bank name
with AES-256-GCM. A random 96-bit IV is generated for every version. Organization ID and vendor ID
are authenticated as additional data. The row records the IV, authentication tag, ciphertext, and
key ID; it stores only display masks outside the ciphertext.

The configured field secret is expanded into separate encryption and fingerprint keys with HKDF.
The HMAC fingerprint supports same-tenant equality checks without storing a deterministic account
ciphertext. Bank versions, verification statements, and reveal audit events are append-only.

The current key ID must be available for reveal. Key rotation will add a key-ring provider before
production migration; prior rows already carry the identifier needed to select their decrypt key.

## Consequences

- A database-only reader cannot recover full bank fields without the application key.
- Moving ciphertext to a different organization or vendor fails GCM authentication.
- Lists and audit events cannot accidentally serialize plaintext because their selects omit it.
- Backup and secret rotation procedures must preserve old keys until governed re-encryption ends.
- Search is limited to masked metadata and the HMAC equality fingerprint; partial account search is
  deliberately unsupported.
