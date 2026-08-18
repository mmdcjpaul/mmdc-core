# F09-T03 deployment acceptance evidence

| Field              | Value                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence state     | **Blocked — authentic external release evidence not supplied**                                                                                                                                                                       |
| Local verifier     | Passed deterministic synthetic reconciliation and negative-path proof                                                                                                                                                                |
| External verifier  | Not run against a retained authentic release record                                                                                                                                                                                  |
| Environment        | development; no F09-T03 runtime release is claimed                                                                                                                                                                                   |
| Required release   | An explicitly approved `vMAJOR.MINOR.PATCH-dev.N` development tag with runtime secret channel                                                                                                                                        |
| Required evidence  | Repository/ref/workflow, Git SHA, ECR digest, desired-state digest/integrity, migration version, web/worker digests, probes, final status, approvals, timestamps, and retained artifact references                                   |
| Synthetic evidence | Clearly labeled in `tests/acceptance/F09-T03-probe.mjs`; never promoted to acceptance                                                                                                                                                |
| External mutation  | No tag, GitHub workflow, ECR/S3 publication, Lightsail deployment, Neon mutation, or application release; one authorized IAM bootstrap key was created and the GitHub development environment was configured without runtime secrets |

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

| Check                     | Sanitized result                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Neon aliases        | `NEON_DB` safely reconciled to distinct pooled `DATABASE_URL` and direct `DATABASE_DIRECT_URL`; both are Neon TLS endpoints and both passed read-only connectivity checks |
| Local database mode       | `MMDC_ENVIRONMENT=development` and `MMDC_DATABASE_MODE=neon`; original aliases preserved; no branch name inferred or invented                                             |
| Local Meilisearch aliases | Master source reconciled from existing local alias; admin/indexing and search-only keys are present and distinct; local `.env` remains ignored and mode `0600`            |
| App-02 runtime delivery   | Canonical Neon and Meilisearch runtime values delivered to `/etc/mmdc/runtime.env`; root-owned mode `0600`; no application or worker service started                      |
| Meilisearch service       | Pinned Compose service started privately on `mmdc-internal`; no host port binding; stable development key identities reconciled idempotently with `mmdc-*` index scope    |
| Scope validation          | Master-only key administration, admin/indexing index access, and search-only denial of index administration passed; no key values or response bodies retained in evidence |
| Release boundary          | No tag, GitHub workflow, ECR/S3 publication, Neon mutation, application/worker deployment, or F10 work performed                                                          |

## Current release-gate reconciliation — 2026-08-18

This is a sanitized operator record. It does not contain credential values,
connection strings, provider response bodies, or an authentic release claim.

| Check                          | Sanitized result                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM bootstrap                  | Targeted only `mmdc-v3-development-storage`; pre-check found one active key and one available slot; one new active key was created through the authorized one-time IAM bootstrap; the prior key remains active and was not deleted or deactivated |
| Local credential placement     | New S3 credential material is present only in ignored local `.env`, mode `0600`; no key value was printed, committed, or sent to GitHub                                                                                                           |
| Scoped workload probe          | Media `media/*` put/get/head/delete, media-prefix listing, backup listing/read boundary, deployment-state read boundary, ECR auth/layer/image permission, and unrelated-object denials passed; synthetic media object was cleaned up              |
| Existing policy defect         | `s3:GetBucketLocation` is denied by the existing media statement's `s3:prefix` condition; no IAM policy broadening or policy mutation was performed                                                                                               |
| GitHub development environment | Existing environment configured with one required reviewer, a `v*.*.*-dev.*` tag deployment policy, and `MMDC_DEVELOPMENT_MIGRATION_VERSION=20260817_230000_media_governance`; no runtime secret was uploaded                                     |
| OIDC compatibility             | Local workflow and CloudFormation trust constraints agree on repository, tag ref, workflow ref, and audience; live `iam:GetRole` inspection is unavailable under the scoped `mmdc-iaac` operator policy                                           |
| Host credential delivery       | Blocked: no approved local SSH private key was available and read-only Lightsail access-details retrieval was denied by the scoped operator policy; no host runtime/pull/backup env mutation was attempted in this pass                           |
| Release gate                   | `v0.1.0-dev.1` remains absent locally and remotely; no ECR image, desired state, workflow run, Neon mutation, application start, worker start, or F10 work was performed                                                                          |

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
