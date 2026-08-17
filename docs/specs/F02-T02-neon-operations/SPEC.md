---
id: F02-T02
feature: F02 Payload and Neon
title: Implement bootstrap, seed guards, Neon contracts, and recovery
autonomy: guarded
---

# Implement Neon operational contracts

## Intent

Make bootstrap, synthetic data, pooled runtime, direct administration, and recovery safe and repeatable.

## Requirements

- **F02-T02-R01 — Event-driven:** WHEN an initial administrator is bootstrapped, the system SHALL use a documented one-time path without committing or logging a credential.
- **F02-T02-R02 — Event-driven:** WHEN seed or reset is requested, the system SHALL use synthetic fixtures and SHALL refuse development, staging, and production unless the documented explicit break-glass guard is satisfied.
- **F02-T02-R03 — Ubiquitous:** Application and worker runtime SHALL use the TLS-required pooled `DATABASE_URL`, while migrations, inspection, backup, and restore SHALL use the TLS-required `DATABASE_DIRECT_URL`.
- **F02-T02-R04 — Event-driven:** WHEN pooled compatibility is evaluated, the integration suite SHALL exercise jobs, drafts/versions in scope, transactions, locking, suspend/wake, timeouts, retries, and Singapore latency.
- **F02-T02-R05 — Unwanted behavior:** IF a Payload operation is proven incompatible with transaction pooling, THEN the system SHALL use a bounded direct connection only for that process and record the exception in an ADR.
- **F02-T02-R06 — Event-driven:** WHEN recovery is rehearsed, operators SHALL create an isolated temporary branch/environment, restore and validate there, and follow an approved cutover procedure.
- **F02-T02-R07 — Prohibition:** Recovery tooling SHALL NOT run `pg_dump` through the pooled URL or test restore over a live branch.

## Acceptance criteria

- Bootstrap and logs contain no committed credential.
- Seed/reset guard tests cover every protected environment and the break-glass path.
- Pooled and direct connection tests fail if URLs are swapped or TLS is absent.
- Runbooks cover restore window, pre-migration recovery points, logical backup, retention, temporary branch cleanup, validation, and cutover ownership.

## Validation

`tests/acceptance/F02-T02.sh` shall run connection/guard tests and lint sanitized Neon compatibility and recovery evidence. External evidence must name its approver and environment. Run `./validation.sh F02-T02`.

## Dependencies

F02-T01 and F00-T02.

## Traces

Implementation Plan sections 6.1-6.3, Phase 2, rollback policy, Neon risks, and decisions 1-2 and 7.
