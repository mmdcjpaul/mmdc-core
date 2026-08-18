# F09-T03 deployment acceptance evidence

| Field              | Value                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence state     | **Blocked — authentic external release evidence not supplied**                                                                                                                                            |
| Local verifier     | Passed deterministic synthetic reconciliation and negative-path proof                                                                                                                                     |
| External verifier  | Not run against a retained authentic release record                                                                                                                                                       |
| Environment        | development; no F09-T03 runtime release is claimed                                                                                                                                                        |
| Required release   | An explicitly approved `vMAJOR.MINOR.PATCH-dev.N` development tag                                                                                                                                         |
| Required evidence  | Repository/ref/workflow, Git SHA, ECR digest, desired-state digest/integrity, migration version, web/worker digests, probes, final status, approvals, timestamps, and retained artifact references        |
| Synthetic evidence | Clearly labeled in `tests/acceptance/F09-T03-probe.mjs`; never promoted to acceptance                                                                                                                     |
| External mutation  | No tag, GitHub workflow, ECR/S3 publication, Lightsail deployment, Neon mutation, or application release; the authorized existing workload credential was delivered to root-only app-02 environment files |

## Release-preparation audit — 2026-08-18 (pre-reconciliation snapshot)

| Check                      | Sanitized result                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation commit          | `589e9eabb2e8e3e52232900233a608fcd49958ec`; pushed to `origin/development` and verified reachable there                                                                                                             |
| Requested tag              | `v0.1.0-dev.1` absent locally and on `origin`; no tag was created or pushed                                                                                                                                         |
| GitHub environment channel | Repository reports zero environments; `development` protected environment, secrets, and variables are absent                                                                                                        |
| App-02 host channel        | SSH host keys match retained F08 fingerprints; `/etc/mmdc/runtime.env`, `/etc/mmdc/pull.env`, and `/etc/mmdc/backup.env` are root-owned mode `0600`, but all are zero bytes with no keys                            |
| Host pull agent            | Installed and checked through the approved SSH path; SHA-256 `a041253e04d9f32e73d3049e0bb35912112919f0c08c9530f4cab5f32b9963d9`, root-owned mode `0750`; service enabled and active                                 |
| Host backup wrapper        | SHA-256 `39c3e157bd4e96be5f727bd8db4157bc1d813b085ae2599cc520ade4d959d0d1`, root-owned mode `0750`                                                                                                                  |
| AWS read-only inspection   | `mmdc-iaac` identity verified as account `349762920349`, assumed role `MMDCIaacOperator`; stack `mmdc-v3-development` is `UPDATE_COMPLETE`; direct Lightsail/ECR inspection is denied by the scoped operator policy |
| Release outcome            | Tag/workflow/publication/deployment gate stopped before tag push because protected approval and runtime secret channels are missing                                                                                 |

## Runtime prerequisite reconciliation — 2026-08-18

This records prerequisite readiness only; it does not promote F09-T03 to Done
and does not claim an application or worker release.

| Check                     | Sanitized result                                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Neon aliases        | `NEON_DB` safely reconciled to distinct pooled `DATABASE_URL` and direct `DATABASE_DIRECT_URL`; both are Neon TLS endpoints and both passed read-only connectivity checks                                                                                             |
| Local database mode       | `MMDC_ENVIRONMENT=development` and `MMDC_DATABASE_MODE=neon`; original aliases preserved; no branch name inferred or invented                                                                                                                                         |
| Local Meilisearch aliases | Master source reconciled from existing local alias; admin/indexing and search-only keys are present and distinct; local `.env` remains ignored and mode `0600`                                                                                                        |
| App-02 runtime delivery   | Payload, distinct pooled/direct Neon, scoped Meilisearch, media S3, and documented non-secret runtime values are present in `/etc/mmdc/runtime.env`; root-owned mode `0600`; raw Compose parsing preserves secret bytes; no application or worker service started     |
| Pull/backup delivery      | `/etc/mmdc/pull.env` and `/etc/mmdc/backup.env` are nonempty, root-owned mode `0600`, and name the governed development ECR, deployment, media, and backup resources; the backup scope receives only the direct Neon URL                                              |
| Meilisearch service       | The existing pinned Compose service remains private on `mmdc-internal` with no host port binding; master, admin/indexing, and search-only identities remain distinct with `mmdc-*` scope                                                                              |
| Scope validation          | Distinct pooled/direct Neon read-only connectivity, Meilisearch master/admin/search allow/deny boundaries, media/backup/desired-state reads, ECR authorization/repository reads, and unrelated media-prefix/bucket denials passed without listing or mutating objects |
| Release boundary          | No tag, GitHub workflow, ECR/S3 publication, Neon mutation, application/worker deployment, or F10 work performed                                                                                                                                                      |

## Current release-gate reconciliation — 2026-08-18

This is a sanitized operator record. It does not contain credential values,
connection strings, provider response bodies, or an authentic release claim.

| Check                          | Sanitized result                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM bootstrap                  | Targeted only `mmdc-v3-development-storage`; pre-check found one active key and one available slot; one new active key was created through the authorized one-time IAM bootstrap; the prior key remains active and was not deleted or deactivated |
| Local credential placement     | New S3 credential material is present only in ignored local `.env`, mode `0600`; no key value was printed, committed, or sent to GitHub                                                                                                           |
| Scoped workload probe          | Media `media/*` put/get/head/delete, media-prefix listing, backup listing/read boundary, deployment-state read boundary, ECR auth/layer/image permission, and unrelated-object denials passed; synthetic media object was cleaned up              |
| IAM correction                 | Historical pre-execution finding: `s3:GetBucketLocation` was denied by the media statement's `s3:prefix` condition. The exact approved correction and successful post-update probe are recorded below.                                            |
| GitHub development environment | Existing environment configured with one required reviewer, a `v*.*.*-dev.*` tag deployment policy, and `MMDC_DEVELOPMENT_MIGRATION_VERSION=20260817_230000_media_governance`; no runtime secret was uploaded                                     |
| OIDC compatibility             | Local workflow and CloudFormation trust constraints agree on repository, tag ref, workflow ref, and audience; live `iam:GetRole` inspection is unavailable under the scoped `mmdc-iaac` operator policy                                           |
| Host credential delivery       | Approved SSH key is present at `~/.ssh/mmdc-v3-development`; strict SSH access to app-02 succeeds. No host runtime/pull/backup env mutation was attempted in this IAM/OIDC pass                                                                   |
| Release gate                   | `v0.1.0-dev.1` remains absent locally and remotely; no ECR image, desired state, workflow run, Neon mutation, application start, worker start, or F10 work was performed                                                                          |

## App-02 protected environment completion — 2026-08-18

This completion record contains variable names and governed resource identifiers
only. No secret value, connection string, provider response body, or object key
inventory is retained.

| Check             | Sanitized result                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protected files   | `/etc/mmdc/runtime.env`, `/etc/mmdc/pull.env`, and `/etc/mmdc/backup.env` are nonempty, `root:root`, mode `0600`; `/etc/mmdc/pull-agent.env` selects the protected pull contract with the same ownership and mode                                                                                                                                                                                    |
| Runtime contract  | Payload secret, canonical distinct pooled/direct database URLs, canonical distinct Meilisearch master/admin/search keys, worker bounds, media S3 configuration/credential names, and documented site/internal values are present                                                                                                                                                                     |
| Pull contract     | Exact ECR repository `349762920349.dkr.ecr.ap-southeast-1.amazonaws.com/mmdc-v3-development`; deployment bucket `mmdc-v3-development-deployments-349762920349-ap-southeast-1`; media bucket `mmdc-v3-development-media-349762920349-ap-southeast-1`; backup bucket `mmdc-v3-development-backups-349762920349-ap-southeast-1`; scoped credential names and readiness/status command names are present |
| Backup contract   | Direct database URL only, `/opt/mmdc/backups/` output boundary, governed backup bucket/prefix, region, and scoped credential names are present                                                                                                                                                                                                                                                       |
| Host tooling      | Checksum-pinned AWS CLI v2.36.25, Docker Compose v5.5.0, raw application/worker env parsing, and ECR password-stdin authentication support are installed; pull-agent readiness passes                                                                                                                                                                                                                |
| Connectivity      | Pooled and direct Neon read-only transactions passed; Meilisearch health and master/admin/search boundaries passed; media and backup bucket location, media/backup object-read boundary, exact desired-state read, and ECR token/repository-read operations passed                                                                                                                                   |
| Denials           | Unrelated media prefix and deployment-bucket location operations returned access denied; admin/search Meilisearch keys cannot administer keys; no S3 object was listed, created, changed, or deleted                                                                                                                                                                                                 |
| Secret correction | A missing delimiter in ignored local `.env` had concatenated a duplicate S3 access-key assignment after the quoted search-only key. The duplicate matched the canonical standalone assignment and was removed without changing either credential's bytes; no tracked file contains the values                                                                                                        |
| Service boundary  | Application and worker remain stopped; the existing private Meilisearch container remains unchanged; no release, migration, deployment, or F10 action occurred                                                                                                                                                                                                                                       |

## Precise blocker and input checklist

F09-T03 cannot be marked Done until an authorized operator supplies all of the
following through the approved external channel:

1. Explicit approval for one exact development semantic tag/release and its
   workflow run, with the required development runtime secret channel available.
2. Retained GitHub workflow evidence naming repository, exact ref, run ID,
   actor, commit SHA, and protected-environment approval.
3. Retained ECR evidence naming the Git-SHA tag and exact immutable digest,
   plus SBOM/provenance references and hashes.
4. The exact F09-T01 desired-state object and its canonical integrity and
   artifact digests.
5. Sanitized Neon recovery/migration evidence naming migration version and
   outcome; no connection strings or secret values.
6. Sanitized host status naming exact web/worker digests, required probe
   results, final status, UTC timestamps, correlation ID, and retained status
   reference.
7. Provider/host evidence references and named approver records sufficient to
   prove the result is authentic rather than synthetic.

Validate the assembled record with the runbook command in
`docs/runbooks/deployment-acceptance.md`. A missing record, substituted
identifier, synthetic marker, unbounded log/status, secret-shaped value, or
missing stage must remain a failing gate.

## IAM/OIDC infrastructure blocker reconciliation — 2026-08-18

This section records the repository and live CloudFormation inspection that
preceded the exact approved IAM correction. Its execution is recorded below.
It did not create a release tag, publish ECR/S3 desired state, change GitHub,
alter host environment files, mutate Neon, or start F10.

| Check                         | Sanitized result                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS identity                  | `mmdc-iaac` verified account `349762920349`, caller `arn:aws:sts::349762920349:assumed-role/MMDCIaacOperator/mmdc-iaac-cli` before each CloudFormation inspection                                                                                                                                                     |
| Live stack                    | `mmdc-v3-development`, `UPDATE_COMPLETE`, execution role `arn:aws:iam::349762920349:role/MMDCDevelopmentCloudFormationExecution`, region `ap-southeast-1`                                                                                                                                                             |
| Live processed-template trust | CloudFormation `Processed` template trust matches the repository trust exactly: `aud=sts.amazonaws.com`, repository-bound development tag subject, and exact `job_workflow_ref` parameter; no direct `iam:GetRole` inspection was used                                                                                |
| Release workflow comparison   | `.github/workflows/release.yml` triggers only `v*.*.*-dev.*` tag pushes; its publish job uses protected `environment: development`, requests `id-token: write`, and assumes `mmdc-v3-development-github-deploy`; the exact workflow ref is `mmdcjpaul/mmdc-core/.github/workflows/release.yml@refs/heads/development` |
| OIDC decision                 | No correction required. The trust accepts the exact tag/workflow/audience claims and rejects development branch pushes, non-development tags, another repository, and another workflow ref. No trust broadening was made.                                                                                             |
| IAM defect                    | `ApplicationStorageUser` split `s3:GetBucketLocation` into an unconditioned MediaBucket ARN statement; `s3:ListBucket` remains limited to `media` and `media/*`; object access remains `MediaBucket/media/*`.                                                                                                         |
| Analogous statements          | Deployment access remains exact `desired.json` read plus `status/*` write. Backup access remains limited to the dedicated development backup bucket; its unconditioned bucket listing/location access is required for recovery inspection and does not grant another bucket.                                          |
| Test result                   | Dependency-free IAM simulation now evaluates resource and `StringLike` conditions for allowed/denied media, deployment, backup, ECR, unrelated-bucket/action, and OIDC claim cases.                                                                                                                                   |

## Exact approved change-set record — 2026-08-18

| Field                  | Sanitized result                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change-set ARN         | `arn:aws:cloudformation:ap-southeast-1:349762920349:changeSet/f09-t03-iam-20260818-094811/d66f73f6-f14d-4978-8864-02c6ef8c3ef9`                                                                                                                                                                                                                           |
| Stack / region         | `mmdc-v3-development` / `ap-southeast-1`                                                                                                                                                                                                                                                                                                                  |
| Template SHA-256       | `sha256=6392ea59391d4e299376846f26c51faef53ab296848c5f4440af09db7a663864`                                                                                                                                                                                                                                                                                 |
| Change-set status      | `CREATE_COMPLETE` / `EXECUTE_COMPLETE`; exact change set was inspected, approved, and executed                                                                                                                                                                                                                                                            |
| Resource actions       | 0 additions, 1 in-place modification (`ApplicationStorageUser` policy properties, `Replacement=False`), 0 deletions, 0 replacements                                                                                                                                                                                                                       |
| IAM delta              | Adds unconditioned `s3:GetBucketLocation` on the MediaBucket ARN; removes that action from the prefix-conditioned media ListBucket statement; preserves `s3:ListBucket` only for `media` and `media/*`, media object operations only for `media/*`, exact deployment-state paths, dedicated-backup-bucket scope, ECR pull scope, and unchanged OIDC trust |
| Resource / cost impact | No new resources, deletions, replacements, host changes, or recurring cost delta; only the existing workload user’s inline policy is updated                                                                                                                                                                                                              |
| Execution role         | `arn:aws:iam::349762920349:role/MMDCDevelopmentCloudFormationExecution`                                                                                                                                                                                                                                                                                   |
| Parameters             | Existing approved stack parameters retained, including `SshCidr=112.206.100.141/32`, `medium_3_0`, `ubuntu_24_04`, `ap-southeast-1a`, edge disabled, exact repository/workflow ref, and existing OIDC provider ARN                                                                                                                                        |

The exact ARN and digest were approved before execution. Approval of a different
or later change set did not apply.

## Approved IAM correction execution — 2026-08-18

The user approved the exact ARN and template digest above. The execution used
only the documented CloudFormation execution role and the `mmdc-iaac` profile;
no other change set was created or executed.

| Check                          | Sanitized result                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-execution identity         | Account `349762920349`; `arn:aws:sts::349762920349:assumed-role/MMDCIaacOperator/mmdc-iaac-cli`                                                                                                                                                                      |
| Execution                      | The approved change set `d66f73f6-f14d-4978-8864-02c6ef8c3ef9` executed successfully; no alternate ARN was used                                                                                                                                                      |
| Stack result                   | `mmdc-v3-development` reached `UPDATE_COMPLETE` at `2026-08-18T09:57:39.453Z`; no resource additions, deletions, replacements, host changes, or recurring cost changes                                                                                               |
| Applied IAM result             | `ApplicationStorageUser` now has unconditioned MediaBucket `s3:GetBucketLocation`; media `s3:ListBucket` remains limited to `media` and `media/*`; object scope remains `media/*`                                                                                    |
| Live processed-template result | CloudFormation processed template shows the expected split statements and unchanged deployment, backup, ECR, and OIDC boundaries                                                                                                                                     |
| Live workload S3 probe         | Media bucket location allowed; `media` listing allowed; `private` listing denied HTTP 403; media-prefix object boundary allowed (nonexistent object returned not-found); private-prefix object denied HTTP 403; unrelated deployment-bucket location denied HTTP 403 |
| Secret boundary                | Existing local `.env` values were loaded in memory only for the read-only workload probe; no values or objects were printed, retained, created, changed, or deleted                                                                                                  |
| Remaining F09-T03 state        | Authentic release evidence is still absent, so the ticket remains fail-closed/Blocked; `v0.1.0-dev.1` was not created or pushed and F10 was not started                                                                                                              |
