---
plan: MMDC-WEB-PLAN-001
plan_version: 0.1
last_updated: 2026-08-17
status_values: Not started | In progress | Done | Blocked
progress_total: 25
progress_done: 2
progress_blocked: 0
---

# Foundation implementation tracker

The first eligible `Not started` row is the next ticket. `loop.sh` resumes an `In progress` ticket before selecting a new one. A blocked ticket stops the loop.

| ID | Feature | Task | Status | Depends on | Spec |
| --- | --- | --- | --- | --- | --- |
| F00-T01 | Project controls | Record architecture and access decisions | Done | None | docs/specs/F00-T01-architecture-decisions/SPEC.md |
| F00-T02 | Project controls | Establish ownership, environment, secret, cost, and policy registers | Done | F00-T01 | docs/specs/F00-T02-project-registers/SPEC.md |
| F01-T01 | Reproducible scaffold | Create the exact-version Next.js application scaffold | Not started | F00-T01 | docs/specs/F01-T01-application-scaffold/SPEC.md |
| F01-T02 | Reproducible scaffold | Integrate Payload, environment validation, and quality commands | Not started | F01-T01 | docs/specs/F01-T02-payload-tooling/SPEC.md |
| F02-T01 | Payload and Neon | Configure Payload data model, migrations, and generated types | Not started | F01-T02 | docs/specs/F02-T01-payload-data-foundation/SPEC.md |
| F02-T02 | Payload and Neon | Implement bootstrap, seed guards, Neon contracts, and recovery | Not started | F02-T01,F00-T02 | docs/specs/F02-T02-neon-operations/SPEC.md |
| F03-T01 | Local development | Provide isolated local services and database-target guards | Not started | F02-T02 | docs/specs/F03-T01-local-services/SPEC.md |
| F03-T02 | Local development | Provide the repeatable developer command contract | Not started | F03-T01 | docs/specs/F03-T02-developer-workflow/SPEC.md |
| F04-T01 | Search and worker | Establish Meilisearch key boundaries and the worker process | Not started | F03-T02 | docs/specs/F04-T01-search-worker-runtime/SPEC.md |
| F04-T02 | Search and worker | Implement idempotent projection, rebuild, and failure behavior | Not started | F04-T01 | docs/specs/F04-T02-search-projection/SPEC.md |
| F05-T01 | Media storage | Provision private S3 storage and integrate the Payload adapter | Not started | F02-T01,F00-T02 | docs/specs/F05-T01-s3-storage/SPEC.md |
| F05-T02 | Media storage | Enforce governed media validation, delivery, and recovery | Not started | F05-T01 | docs/specs/F05-T02-media-governance/SPEC.md |
| F06-T01 | Production runtime | Build the hardened immutable application image | Not started | F04-T02,F05-T02 | docs/specs/F06-T01-production-image/SPEC.md |
| F06-T02 | Production runtime | Define Compose services, health, lifecycle, and smoke tests | Not started | F06-T01 | docs/specs/F06-T02-compose-runtime/SPEC.md |
| F07-T01 | CI quality | Implement reproducible quality, migration, integration, and image jobs | Not started | F06-T02 | docs/specs/F07-T01-ci-quality-jobs/SPEC.md |
| F07-T02 | CI quality | Harden CI permissions, scans, artifacts, and merge gates | Not started | F07-T01,F00-T02 | docs/specs/F07-T02-ci-security-gates/SPEC.md |
| F08-T01 | AWS infrastructure | Define tagged development infrastructure in CloudFormation | Not started | F07-T02,F05-T02 | docs/specs/F08-T01-cloudformation/SPEC.md |
| F08-T02 | AWS infrastructure | Bootstrap and approve reproducible host provisioning | Not started | F08-T01,F00-T02 | docs/specs/F08-T02-host-bootstrap/SPEC.md |
| F09-T01 | Deployment | Validate release tags and publish immutable ECR desired state | Not started | F08-T02 | docs/specs/F09-T01-release-publication/SPEC.md |
| F09-T02 | Deployment | Implement pull deployment, one-shot migration, and health rollback | Not started | F09-T01 | docs/specs/F09-T02-pull-deployment/SPEC.md |
| F09-T03 | Deployment | Prove deployment rejection, idempotency, audit, and recovery paths | Not started | F09-T02 | docs/specs/F09-T03-deployment-acceptance/SPEC.md |
| F10-T01 | Operations | Enforce edge access and network isolation | Not started | F09-T03 | docs/specs/F10-T01-edge-security/SPEC.md |
| F10-T02 | Operations | Establish observability, alerts, and operational runbooks | Not started | F10-T01 | docs/specs/F10-T02-observability-runbooks/SPEC.md |
| F10-T03 | Operations | Rehearse recovery and validate host capacity | Not started | F10-T02 | docs/specs/F10-T03-recovery-capacity/SPEC.md |
| F11-T01 | Acceptance | Publish foundation evidence and gate the Article handoff | Not started | F10-T03 | docs/specs/F11-T01-foundation-acceptance/SPEC.md |
