# Contributing

Every feature must declare its tenant boundary, authorization policy, state transition, audit behavior, and tests before implementation.

## Branch and commit guidance

- Use focused branches such as `feat/tenant-onboarding` or `security/refresh-reuse-detection`.
- Keep migrations coherent and never edit a migration that has already been shared.
- Use Conventional Commit prefixes: `feat`, `fix`, `security`, `test`, `docs`, `build`, or `chore`.

## Definition of done

- Acceptance criteria are demonstrably satisfied.
- Success, denial, and failure paths are tested.
- Tenant B cannot access Tenant A's resources.
- Sensitive values are redacted from logs and audit metadata.
- OpenAPI and architecture documentation match the implementation.
- Lint, typecheck, tests, and security checks pass.
