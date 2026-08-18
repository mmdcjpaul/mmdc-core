# F09-T03 deployment acceptance evidence

| Field              | Value                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence state     | **Blocked — authentic external release evidence not supplied**                                                                                                                                              |
| Local verifier     | Passed deterministic synthetic reconciliation and negative-path proof                                                                                                                                       |
| External verifier  | Authentic release run `32143820431` and green foundation run `32139737005` retained; the release run failed during OIDC credential configuration before ECR/S3 publication, with remediation recorded below |
| Environment        | development; no F09-T03 runtime release is claimed                                                                                                                                                          |
| Required release   | An explicitly approved `vMAJOR.MINOR.PATCH-dev.N` development tag                                                                                                                                           |
| Required evidence  | Repository/ref/workflow, Git SHA, ECR digest, desired-state digest/integrity, migration version, web/worker digests, probes, final status, approvals, timestamps, and retained artifact references          |
| Synthetic evidence | Clearly labeled in `tests/acceptance/F09-T03-probe.mjs`; never promoted to acceptance                                                                                                                       |
| External mutation  | Exact tag `v0.1.0-dev.2` was pushed at the approved commit and triggered one protected workflow run; no ECR/S3 publication, Lightsail deployment, Neon mutation, or application release occurred            |

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
| Release boundary          | The later exact tag/workflow attempt failed before AWS credential configuration; no ECR/S3 publication, Neon mutation, application/worker deployment, or F10 work occurred                                                                                            |

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
| Release gate                   | `v0.1.0-dev.1` exists locally/remotely at `fa2c3812fa7e54064f250928fc46837d7924d863`; run `32130129246` received protected-environment approval but failed before AWS publication; no Neon, host, service, or F10 transition occurred             |

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

## Guarded release publication attempt — 2026-08-18

| Check                | Sanitized result                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact ref            | Lightweight tag `v0.1.0-dev.1` points to approved commit `fa2c3812fa7e54064f250928fc46837d7924d863`, which was reachable from `origin/development` when the tag was created; no other tag or workflow was created                                                                                                 |
| Workflow             | [Run `32130129246`](https://github.com/mmdcjpaul/mmdc-core/actions/runs/32130129246), exact tag ref and commit; `release-quality` completed successfully                                                                                                                                                          |
| Environment review   | GitHub records `approved` for protected environment `development` by reviewer `mmdcjpaul`; pending deployment count reached zero                                                                                                                                                                                  |
| Publication result   | `publish-development-release` failed in `Validate trusted semantic tag and development ancestry` at `2026-08-18T11:12:29Z` because `rg` was unavailable on the `ubuntu-24.04` runner (`exit 127`)                                                                                                                 |
| AWS boundary         | Failure occurred before `aws-actions/configure-aws-credentials`; ECR authentication/build/push/tag mapping and S3 desired-state publication steps were skipped                                                                                                                                                    |
| Artifact boundary    | The always-run evidence upload found no `.artifacts/release` files because validation failed before artifact creation; no immutable digest, desired-state integrity, SBOM, or provenance record exists for this attempt                                                                                           |
| Prohibited actions   | No retry, force-update, replacement tag, AWS mutation, host reconciliation, Neon operation, application/worker start, deployment, or F10 work occurred                                                                                                                                                            |
| Required remediation | Preserve immutable failed tag/run evidence. The approved repository-only correction removes all three undeclared `rg` runner dependencies, adds fail-closed command preflights and portable predicate tests, and requires separate approval for a new semantic development tag; `v0.1.0-dev.1` must not be reused |

## Release workflow runner-dependency correction — 2026-08-18

| Check               | Sanitized result                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failure scope       | Run `32130129246` exposed three direct `rg` dependencies in the publication job: exact tag membership, immutable digest shape, and commit timestamp shape. No other `rg` invocation exists in `.github/workflows/release.yml`               |
| Portable correction | Exact tag matching now uses `grep -Fx --`; digest and timestamp validation use anchored POSIX ERE predicates through `grep -E`/`grep -Eq`; existing event/ref/forced-update/development-ancestry checks remain unchanged and fail closed    |
| Runner preflight    | The pre-AWS validation phase verifies `git`, `grep`, and `node`; the publication phase verifies `aws`, `docker`, `git`, `grep`, and `node` after their setup actions and before ECR authentication or publication                           |
| Focused acceptance  | F09-T01 exercises accepted and rejected tag, digest, and timestamp inputs; asserts exact event/ref/tag/ancestry workflow predicates; rejects any remaining workflow `rg`; and proves the command preflight fails for an unavailable command |
| Release boundary    | The failed run was not rerun, `v0.1.0-dev.1` was not changed or reused, and no tag, ECR/S3 publication, AWS/Neon mutation, host reconciliation, service start, deployment, or F10 action occurred during the correction                     |

## Foundation CI failure remediation — 2026-08-18

Run `32132576967` is retained as the exact diagnostic input for this focused
repository correction. Its failing jobs were integration, container-smoke, and
security-scans; the other foundation jobs passed.

| Finding                 | Sanitized evidence and correction                                                                                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration             | Meilisearch `v1.51.0` rejected disposable key creation with HTTP 400, `Missing field \`expiresAt\``. The CI request now supplies a shared ISO timestamp ten minutes in the future, bounding disposable-key lifetime to the test window.                                                                                                       |
| Container smoke command | F06-T02 required `rg`, which is not installed on the GitHub runner. All eight F06-T02 predicates now use portable `grep`/`grep -E` equivalents, and the preflight requires `grep` instead.                                                                                                                                                    |
| Container smoke lint    | ESLint reported one warning from the generated Payload `payload-types.ts` blanket disable directive. The generated file is now explicitly ignored by the repository ESLint configuration; authored source remains linted, and the full direct F06-T02 smoke passed locally.                                                                   |
| Security scan           | The only blocking finding was the intentionally synthetic credential-shaped URL literal at `tests/acceptance/F09-T03-probe.mjs:236`. The test now assembles that value at runtime, preserving the sensitive-value rejection assertion without adding a scanner exemption. Dependency, license, IaC, and container scans were already passing. |
| Regression coverage     | F07-T02, F09-T01, the F09-T03 deterministic probe, the workflow harness, typecheck, unit tests, lint, format, real security gates, and direct F06-T02 container acceptance passed locally.                                                                                                                                                    |
| Boundary                | No GitHub rerun, tag, AWS/Neon/GitHub-settings mutation, ECR/S3 publication, host reconciliation, service start, deployment, or F10 work occurred while making this correction.                                                                                                                                                               |

## Immutable release publication attempt — 2026-08-18

This records the separately approved `v0.1.0-dev.2` publication attempt. The
semantic tag remains immutable and is not to be modified or reused. No host,
Neon, service-start, GitHub-settings, or F10 operation was performed.

| Check               | Sanitized result                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact ref           | Annotated tag `v0.1.0-dev.2` points exactly to `ffb44d2e550510962532f270011d297bacb6bc33`; the tag was absent before creation and `v0.1.0-dev.1` remains unchanged at its original commit                                   |
| Foundation gate     | Run `32139737005` completed successfully for `ffb44d2e550510962532f270011d297bacb6bc33` before the tag was created                                                                                                          |
| Workflow            | [Run `32143820431`](https://github.com/mmdcjpaul/mmdc-core/actions/runs/32143820431), exact tag ref and commit; `release-quality` succeeded                                                                                 |
| Environment review  | Protected `development` review was recorded through GitHub's pending-deployment approval endpoint by the authenticated required reviewer `mmdcjpaul`; deployment record `5963982058` was created for the exact commit       |
| Publication result  | `publish-development-release` failed at `aws-actions/configure-aws-credentials@v4` with `Not authorized to perform sts:AssumeRoleWithWebIdentity` before ECR authentication, image build, digest mapping, or S3 publication |
| AWS read-only check | With `mmdc-iaac`, account `349762920349` and assumed role `MMDCIaacOperator` were verified; the exact ECR semantic tag, exact Git-SHA image tag, and deployment `desired.json` object were all absent after the failed run  |
| Artifact boundary   | No `.artifacts/release` files were produced; the always-run upload therefore retained no publication evidence, and no immutable ECR digest or desired-state integrity exists for this attempt                               |
| Prohibited actions  | No retry, tag modification, ECR/S3 publication, host reconciliation, Neon operation, application/worker start, deployment, GitHub-settings change, or F10 work occurred                                                     |
| Acceptance state    | F09-T03 remains **Blocked** pending a successful authentic release publication and the separately guarded host-deployment/migration evidence required by the acceptance checklist                                           |

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
| Remaining F09-T03 state        | Authentic run evidence is retained, but publication failed before AWS access, so no immutable ECR/desired-state/deployment evidence exists and the ticket remains fail-closed/Blocked; failed tag `v0.1.0-dev.1` is not reusable and F10 was not started             |

## GitHub OIDC trust-claim correction — 2026-08-18

Root cause of the `v0.1.0-dev.2` publication failure. The trust policy on
`mmdc-v3-development-github-deploy` required two claims the release workflow
cannot emit, so `sts:AssumeRoleWithWebIdentity` was denied before any AWS
access. Both mismatches were confirmed against the live deployed stack, not
inferred from the repository template alone.

| Claim              | Trust policy required (before)                        | Token actually presented                           |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------- |
| `sub`              | `repo:mmdcjpaul/mmdc-core:ref:refs/tags/v*.*.*-dev.*` | `repo:mmdcjpaul/mmdc-core:environment:development` |
| `job_workflow_ref` | `.../release.yml@refs/heads/development`              | `.../release.yml@refs/tags/v0.1.0-dev.2`           |

| Check                   | Sanitized result                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failure evidence        | Run `32143820431` log: `Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity`, emitted by `aws-actions/configure-aws-credentials@v4`                        |
| Subject-claim basis     | `publish` declares `environment: development`, so GitHub emits the environment-scoped subject; repository OIDC customization is `use_default: true`, so no override alters the claim            |
| Live pre-state          | Deployed `GitHubWorkflowRef` was `.../release.yml@refs/heads/development`; a tag-triggered run pins `job_workflow_ref` to `refs/tags/<tag>`, making the deployed value structurally unmatchable |
| Template drift          | Repository template differed from the deployed template only by this correction; no unrelated drift existed                                                                                     |
| Correction              | `sub` moved to `StringEquals` on `repo:${GitHubRepository}:environment:${EnvironmentName}`; the development-tag restriction now rides on `job_workflow_ref`                                     |
| Change set              | `mmdc-oidc-trust-fix-20260818` / `f92a42e8-7cec-4d52-b61b-c83a5fe447d8`; one `Modify` of `GitHubDevelopmentDeployRole`, `Replacement: False`, `RequiresRecreation: Never`                       |
| Execution               | Approved against the exact ARN, then executed with the documented CloudFormation execution role; `mmdc-v3-development` reached `UPDATE_COMPLETE` at `2026-08-18T14:01:46Z`                      |
| Applied result          | Live processed template now shows the environment-scoped subject under `StringEquals` and the tag-pinned `job_workflow_ref`; only `GitHubDevelopmentDeployRole` changed                         |
| Regression coverage     | `F08-T01` and `F09-T01` probes previously asserted the trust policy against claims GitHub never emits; both were corrected to the real claim shapes with added negative cases                   |
| Boundary                | No ECR publication, S3 desired-state write, host reconciliation, Neon mutation, service start, tag creation/modification, or F10 work occurred                                                  |
| Remaining F09-T03 state | The OIDC blocker is cleared, but no authentic publication has yet succeeded, so F09-T03 remains **Blocked** pending a successful release run and host-deployment evidence                       |
