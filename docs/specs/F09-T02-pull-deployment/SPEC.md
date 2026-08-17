---
id: F09-T02
feature: F09 Deployment
title: Implement pull deployment, one-shot migration, and health rollback
autonomy: guarded
---

# Implement the pull deployment transaction

## Intent

Have the host safely reconcile desired state without CI SSH and preserve a recoverable release boundary.

## Requirements

- **F09-T02-R01 — Event-driven:** WHEN valid newer desired state arrives, the host agent SHALL verify integrity/environment/order, capture the current digest, verify Neon/S3/Meilisearch readiness, and pull the exact ECR digest.
- **F09-T02-R02 — Event-driven:** WHEN a release contains a migration, deployment SHALL record the required pre-migration Neon recovery point/logical backup and run exactly one migration task from the target image through `DATABASE_DIRECT_URL` before traffic switch.
- **F09-T02-R03 — Prohibition:** Application replicas SHALL NOT independently run shared-environment migrations at startup.
- **F09-T02-R04 — Event-driven:** WHEN migration succeeds, the host SHALL recreate web and worker with the exact same digest while preserving Meilisearch data.
- **F09-T02-R05 — Event-driven:** WHEN readiness and synthetic route/Admin/database/search/media probes pass, the agent SHALL publish bounded per-commit success status.
- **F09-T02-R06 — Unwanted behavior:** IF application health fails and the prior image is schema-compatible, THEN the host SHALL restore the prior known-good digest.
- **F09-T02-R07 — Unwanted behavior:** IF migration is backward-incompatible or fails, THEN deployment SHALL retain/enter the documented safe state and use the release-specific forward-fix or Neon restore procedure rather than image-only rollback.

## Acceptance criteria

- Duplicate delivery is idempotent; stale, tampered, wrong-environment, or mutable desired state is rejected.
- Concurrency tests prove one migration and no unsafe cancellation.
- Success and failure simulations preserve explicit current/desired/status state and sanitized logs.
- Host permissions are limited to required desired-state/ECR reads and bounded status writes.

## Validation

`tests/acceptance/F09-T02.sh` shall run the pull agent in a disposable production-like environment across happy, duplicate, stale, tampered, migration-failure, health-failure, rollback, and incompatible-schema scenarios. Run `./validation.sh F09-T02`.

## Dependencies

F09-T01.

## Traces

Implementation Plan Phase 9 deployment sequence, required proof, rollback/failure policy, and replay/migration risks.
