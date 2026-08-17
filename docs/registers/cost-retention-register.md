---
register: cost-and-retention
version: 1.0
status: Active
accountable_owner: Engineering
last_reviewed: 2026-08-17
review_cadence: monthly cost review and before resource changes
---

# Cost and retention register

## Scope

The figures below are planning estimates in USD per month, not provider
invoices or approval to provision. They make the cost envelope and lifecycle
controls reviewable while the guarded plan, region, and resource decisions
remain explicit.

## Accountable owner

Engineering owns the register. AWS owns AWS price confirmation; Neon owns
Neon plan confirmation; Product and Engineering approve budget changes.

## Records

| Subject | Monthly planning estimate (USD) | Cost basis and uncertainty | Deletion policy | Retention / expiry policy | Review owner and cadence | Decision state |
| --- | ---: | --- | --- | --- | --- | --- |
| Neon developer, CI, and temporary recovery branches | 0–100 | Provider plan, compute suspension, storage, and branch duration are not selected | CI branches expire after the run; temporary recovery branches are deleted after isolated evidence and approval; persistent branches require approval | CI: run lifetime; developer: 30-day inactivity review; recovery: 7 days after evidence; persistent restore history follows the approved provider policy | Neon owner monthly | Blocked: Neon plan and restore window require approval |
| S3 media objects and noncurrent versions | 0–25 | Storage, requests, transfer, and version growth depend on media volume and delivery choice | Test objects and abandoned multipart uploads are cleaned by lifecycle rule; production deletion requires the media recovery policy | Noncurrent versions use an approved lifecycle window; evidence objects expire only after the retention decision is recorded | AWS owner monthly | Blocked: bucket class, lifecycle window, and delivery choice require approval |
| ECR image storage and scan artifacts | 0–20 | Image count, compressed size, retention count, and artifact retention are not measured yet | Untagged images and superseded non-release images are eligible for lifecycle cleanup; release digests remain while rollback policy requires them | Retain the current release and rollback set; scan/SBOM evidence follows the acceptance retention decision | AWS owner and Security owner monthly | Blocked: repository lifecycle count and evidence retention require approval |
| Lightsail instance, static IP, attached state, and snapshots | 40–80 | Bundle size, region, disk, snapshot frequency, and transfer are not approved | Orphaned static IPs, obsolete snapshots, and replaced test hosts are deleted after review; production-like state requires owner approval | Keep the active host and the approved rollback snapshot set; host state is non-canonical and never the sole database backup | AWS owner monthly | Blocked: 4 GB bundle, region, snapshot schedule, and deletion policy require approval |
| Logs, metrics, alerts, and retained operational records | 0–25 | Destination, ingestion volume, retention tier, and alert service are not selected | Disposable CI logs expire with the run; operational logs are deleted only through the approved retention policy | Retain deployment/security evidence for the approved review period; do not retain secrets or complete form payloads | Security owner and Engineering monthly | Blocked: observability service and retention period require approval |
| Acceptance evidence, reports, SBOMs, and scan artifacts | 0–15 | Repository/artifact storage, report volume, and retention period are not selected | Superseded disposable artifacts expire through the approved artifact policy; never delete an incident or release record under review | Retain evidence with Git SHA, environment, migration version, test time, result, and artifact links; no secret values | Engineering and Security monthly | Blocked: evidence repository and retention period require approval |

The planning envelope is **USD 40–265 per month**, excluding tax, egress,
unapproved paid Neon features, and provider-specific overages. The range is a
budgeting estimate only; it is not evidence of spend or a committed service
level.

## Change and review

Engineering runs a monthly cost, deletion, retention, and expiry review with
AWS, Neon, Product, and Security owners. Any resource change must update its
estimate, deletion rule, retention/expiry rule, and accountable owner before
approval. No lifecycle rule is treated as active until the corresponding
guarded decision is marked `Approved` with an approver and ISO date.
