# Data classification and retention baseline

| Class        | Examples                                                                      | Authorized readers             | Baseline retention                       | Handling                                                            |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| Public       | Product name, documentation, synthetic demo screenshots                       | Anyone                         | Indefinite                               | Must contain no real personal or financial data.                    |
| Internal     | Workflow metrics, non-sensitive configuration, vendor tags                    | Tenant staff by role           | Tenant lifecycle + 90 days               | Tenant-scoped; redact from public reports.                          |
| Confidential | Resident contact/occupancy, incidents, invoice fields, contracts              | Resource policy and role       | Legal/business need; policy configurable | Encrypt in transit/at rest; audit sensitive reads.                  |
| Restricted   | Full bank account, session/recovery state, document contents, encryption keys | Smallest eligible role/service | Minimum operational/legal period         | Mask by default; application encryption where specified; never log. |

## Field decisions

Every new sensitive field requires:

1. a user outcome and lawful project purpose;
2. an owning module;
3. authorized-reader and authorized-writer policies;
4. masking and audit behavior;
5. retention, deletion, or pseudonymization behavior;
6. fixture guidance that prohibits real data.

## Initial restricted-field rules

- Vendor bank-account values are encrypted at the application layer and displayed masked by default.
- Refresh-token identifiers, recovery codes, and passwords are stored only as hashes.
- Passkey public credentials may be stored; private keys never reach the server.
- Invoice/document bytes never enter logs, notifications, or telemetry.
- Deactivated users retain pseudonymized references required for audit evidence.
