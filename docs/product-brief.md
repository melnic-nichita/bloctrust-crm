# Product brief

## Problem

Apartment associations and small property managers coordinate residents, vendors, contracts, invoices, incidents, and decisions across disconnected chats and spreadsheets. A malicious or mistaken vendor bank-account change can pass through those tools without a reliable hold, independent approval, or traceable evidence.

## Product outcome

BlocTrust provides one tenant-isolated operational record where security is visible product behavior. It helps an association safely review invoices, coordinate maintenance, communicate with residents, and prove who authorized sensitive changes.

## Primary users

| Persona            | Authorized outcome                                                             |
| ------------------ | ------------------------------------------------------------------------------ |
| Organization owner | Creates the tenant, manages recovery, and assigns administrators.              |
| Administrator      | Manages buildings, vendors, contracts, incidents, invoices, and communication. |
| Accountant         | Reviews invoice evidence, records status, and exports approved records.        |
| Resident           | Views permitted costs, reports incidents, communicates, and votes.             |
| Contractor         | Receives scoped work orders and submits controlled evidence.                   |
| Auditor            | Uses time-limited, redacted, read-only access to approved records.             |

## Hero workflow

An administrator uploads a synthetic invoice. The system quarantines and scans it, creates an OCR-assisted draft, and compares it with the vendor and contract history. A recently changed bank account raises an explainable risk score and freezes approval. The initiator cannot self-approve; two distinct, eligible administrators must perform recent passkey verification. Every transition is linked in a redacted audit timeline, and a second tenant receives no resource-existence signal.

## MVP outcomes

- Multi-tenant organizations, memberships, buildings, apartments, and occupancy.
- Vendor Trust Passport with append-only bank-account history and contracts.
- Secure document quarantine, malware scanning, fingerprinting, and OCR suggestions.
- Reproducible invoice risk scoring, holds, separation of duties, and dual approval.
- Reliable workflows through an outbox, idempotent jobs, retries, and dead-letter handling.
- Incidents, work orders, meter readings, one building channel, and one poll decision flow.
- Security center, audit history, safe exports, metrics, backup, and recovery evidence.

## Non-goals for version 1

- No real card processing, payouts, bank credentials, or financial-truth decisions by AI/OCR.
- No dependency on live APIs from all Moldovan utility providers.
- No microservices, Kafka, Kubernetes, blockchain, or end-to-end encryption claims.
- No broad vendor marketplace, public social network, or anonymous-election claim.

## Measurable success

- The hero workflow is explainable in under one minute and demoable in five minutes.
- Tenant B attack tests fail for every tenant-owned endpoint.
- Duplicate events, jobs, uploads, and webhooks create one business outcome.
- No critical/high finding remains in the implemented scope before version 1.0.
- A new developer can launch the local environment from the README.
