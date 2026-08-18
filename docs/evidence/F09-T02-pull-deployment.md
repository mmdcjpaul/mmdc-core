# F09-T02 pull-deployment evidence

| Field | Value |
| --- | --- |
| Evidence state | Local deterministic production-like simulation passed |
| Environment | development (synthetic harness only) |
| Desired-state source | F09-T01 `buildDesiredState` fixtures with canonical SHA-256 integrity |
| Transaction | Atomic lock; prior current digest captured; target image is `repository@sha256:digest` |
| Recovery gate | Synthetic restore-point ID and logical-backup path required before migration |
| Migration | Exactly one `pnpm run migrate:apply` task from the target image; direct URL contract checked; atomic attempted/failed/succeeded marker blocks rerun |
| Service switch | Web/application and worker recreated with the same digest; Meilisearch volume is not touched |
| Status | Bounded per-Git-SHA JSON with fixed sanitized fields and no URLs/secrets |
| Negative paths | Duplicate, stale, tampered, wrong environment, mutable reference, readiness failure, missing recovery evidence |
| Failure paths | Migration failure and same-release failed redelivery (one invocation total), concurrent delivery, compatible health rollback, incompatible-schema safe state |
| External mutation | None — no AWS, GitHub, ECR, S3, Neon, Lightsail, deployment, or SSH operation |
| Validation | `node tests/acceptance/F09-T02-probe.mjs`; `./validation.sh F09-T02` |

This record is repository-local evidence. It is not a claim that a release was
published or deployed to the Lightsail hosts.
