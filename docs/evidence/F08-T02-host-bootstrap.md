# F08-T02 host bootstrap evidence record

This is an authentic, sanitized, digest-bound evidence record. The exact
change-set approval and host-recreation evidence below are retained without
inventing a client timestamp or any secret value. F08-T02 records Phase 8
readiness for a later Phase 9 release; it does not claim that Phase 9 runtime
secrets, desired state, or a deployed application image already exist.

| Field                            | Value                                                                                                                                                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence state                   | Approved                                                                                                                                                                                                                                                                                           |
| AWS identity account             | 349762920349                                                                                                                                                                                                                                                                                       |
| AWS identity caller              | arn:aws:sts::349762920349:assumed-role/MMDCIaacOperator/mmdc-iaac-cli                                                                                                                                                                                                                              |
| Identity verified at (UTC)       | 2026-08-18T06:23:41Z                                                                                                                                                                                                                                                                               |
| CloudFormation template SHA-256  | sha256=3302ecb092f81e501115423eb576b5e1d8fecdb4db32e20432ddb162a67ca645                                                                                                                                                                                                                            |
| Change-set ARN or identifier     | arn:aws:cloudformation:ap-southeast-1:349762920349:changeSet/f08-t02-new-lightsail-20260818-0610/319fbc6f-e248-49ca-93aa-19c7d497be50                                                                                                                                                              |
| Planning cost estimate           | USD 80–205 per month concurrent two-host AWS bundle; registered envelope USD 40–265; sensitivity envelope USD 80–345                                                                                                                                                                               |
| Exact-change-set approver        | User — explicit “go ahead” immediately after the exact ARN/digest/action approval statement                                                                                                                                                                                                        |
| Approval timestamp (UTC)         | Not exposed by client; ordering attestation only: exact approval preceded CloudFormation execution, which completed at 2026-08-18T06:22:18Z (this is not an approval time)                                                                                                                         |
| Approval evidence semantics      | Exact ARN/digest/action approval is recorded by the session ordering immediately after the approval statement and before the recorded execution; the unavailable client timestamp is not inferred                                                                                                  |
| Non-secret stack outputs         | UPDATE_COMPLETE; app-02; app-02 static IP 122.248.253.125; existing app/static IP retained; region ap-southeast-1                                                                                                                                                                                  |
| Recreation environment           | `mmdc-v3-development-app-02` / `122.248.253.125`; Ubuntu 24.04.4 LTS; strict SSH host-key fingerprints: ED25519 `SHA256:Sc/L3ptRdXTJ7bMz8YJI56HHR1Jy5WK3Dg9xFhuB9mw`, RSA `SHA256:D+D3M2nNnuD4MEXkpSpjtpoBlxtasa2FeBtLWefSw5Q`                                                                     |
| Bootstrap run identifier         | `F08-T02-bootstrap-v1`; two successful runs; second run unchanged/idempotent at 2026-08-18T06:31:37Z                                                                                                                                                                                               |
| Installed Docker/Compose version | Docker 29.7.2; Docker Compose v5.5.0                                                                                                                                                                                                                                                               |
| Installed Caddy version          | Reviewed Compose image declaration `caddy:2.10.2-alpine`; Caddy container not started because no release image has been supplied                                                                                                                                                                   |
| Installed pull-agent version     | F08-T02 readiness-only pull agent; SHA-256 `b4dd2df6513189ec0831c2bb734dbb182450368cdfd22550195bccd90922e3f1`                                                                                                                                                                                      |
| Installed backup-tool version    | `mmdc-neon-backup` wrapper; PostgreSQL client `pg_dump` 16.14; wrapper SHA-256 `39c3e157bd4e96be5f727bd8db4157bc1d813b085ae2599cc520ade4d959d0d1`                                                                                                                                                  |
| Private service-boundary result  | Verified: Compose config valid; only Caddy declares public 80/443; application, worker, Meilisearch, and deployment-agent use `mmdc-internal`; smoke PostgreSQL is loopback-only; no containers running                                                                                            |
| Deployment-ready result          | Pass: Phase 8 readiness-ready; bootstrap completed twice, protected runtime/pull/backup locations are present, service is enabled/active, and pull-agent readiness passes. Runtime values, immutable digest, desired state, and deployment transitions are intentionally supplied by Phase 9 (F09) |
| Host source-build result         | Pass: no source build; bootstrap reports no application compilation, and node/npm/pnpm/make/gcc/g++ are absent from the host (git only)                                                                                                                                                            |
| Git SHA                          | `28cd681c9658ec217774ceb62d4987f6165f4376` (worktree contained pre-existing dirty changes)                                                                                                                                                                                                         |

The repository-side bootstrap isolation test is deterministic and does not
stand in for cloud authority, an AWS change set, or an approval. The authentic
execution and host records above provide those external gates; the approval
timestamp is represented only as a truthful ordering attestation because the
client did not expose its timestamp.

## Historical failed final change-set inspection

The final change set reached `CREATE_COMPLETE` / `AVAILABLE` at
`2026-08-18T04:30:06.750Z`. It is an inspection artifact only and is not yet
approved for execution.

- Proposed actions: 2 additions, 11 in-place modifications, 0 removals, and 0
  replacements.
- Adds only the CPU and burst-capacity CloudWatch alarms.
- Preserves the existing Lightsail host, static IP, ECR repository, media,
  backup and deployment buckets, workload user, GitHub role, and account-level
  GitHub OIDC provider.
- Host changes are limited to tags plus `Retain` deletion/update-replace
  policies. The exact change set does not change host networking or recreate
  the instance.
- In-place changes apply the repository's prefix-scoped IAM policies, exact
  GitHub repository/workflow trust, owner/management tags, and the existing
  state-retention controls.
- Execution uses
  `arn:aws:iam::349762920349:role/MMDCDevelopmentCloudFormationExecution`.

The MMDC operator explicitly approved this exact final change-set ARN and
`sha256=6ced9a...d56f7` template digest in the Codex session at
`2026-08-18T05:01:38Z`. This approval authorizes execution of this change set;
it does not fabricate or pre-approve the separate host-recreation evidence.

The execution started at `2026-08-18T05:02:34Z` and rolled back cleanly to
`UPDATE_ROLLBACK_COMPLETE` at `2026-08-18T05:03:18Z`. CloudFormation reported
that the scoped execution role lacked `lightsail:EnableAddOn` while reconciling
the existing AutoSnapshot add-on. No resource was removed or replaced. The
consumed change-set ARN is not reusable; any retry requires a new inspected,
explicitly approved change-set ARN.

## Historical failed retry change-set inspection

The retry change set reached `CREATE_COMPLETE` / `AVAILABLE` at
`2026-08-18T05:04:51.263Z`. It uses the unchanged
`sha256=6ced9a...d56f7` template and proposes the same 2 additions, 11 in-place
modifications, 0 removals, and 0 replacements. The execution-role policy now
includes the required Lightsail AutoSnapshot actions and still passes AWS
Access Analyzer with no findings.

The MMDC operator explicitly approved this exact retry ARN in the Codex
session at `2026-08-18T05:31:00Z`. The approval applies only to this retry and
the unchanged `sha256=6ced9a...d56f7` template.

The retry started at `2026-08-18T05:31:19Z` and rolled back cleanly to
`UPDATE_ROLLBACK_COMPLETE` at `2026-08-18T05:32:04Z`. CloudFormation reported
that the execution role also required `lightsail:PutInstancePublicPorts` while
reconciling the unchanged restricted SSH and public HTTP/HTTPS port set. No
resource was removed or replaced. A further retry requires another exact
change-set ARN and approval.

## Historical failed retry 2 change-set inspection

Retry 2 reached `CREATE_COMPLETE` / `AVAILABLE` at
`2026-08-18T05:34:52.109Z`. Its exact ARN is
`arn:aws:cloudformation:ap-southeast-1:349762920349:changeSet/f08-t02-retry2-20260818-053413/35b8b13b-6d7b-4079-af1a-a159a16abe03`.
It uses the unchanged `sha256=6ced9a...d56f7` template and proposes the same 2
additions, 11 in-place modifications, 0 removals, and 0 replacements. The
execution-role policy now includes `lightsail:PutInstancePublicPorts` and
passes AWS Access Analyzer with no findings.

The MMDC operator explicitly approved this exact retry 2 ARN in the Codex
session immediately before execution at `2026-08-18T05:46:32Z`.

Retry 2 started at `2026-08-18T05:46:33Z`. CloudFormation reported that the
execution role also required `lightsail:StartInstance` while completing the
in-place Lightsail update. The initial rollback stopped at
`UPDATE_ROLLBACK_FAILED` for the same missing permission; no resource was
removed or replaced. The one-time `mmdc` IAM repair added only
`lightsail:StartInstance`, and the resulting policy passed AWS Access Analyzer
with no errors or security warnings. Rollback resumed at
`2026-08-18T05:48:51Z` and restored the stack to
`UPDATE_ROLLBACK_COMPLETE` at `2026-08-18T05:49:45Z`.

## Historical unexecuted retry 3 change-set inspection

Retry 3 reached `CREATE_COMPLETE` / `AVAILABLE` at
`2026-08-18T05:51:14.422Z`. Its exact ARN is
`arn:aws:cloudformation:ap-southeast-1:349762920349:changeSet/f08-t02-retry3-20260818-055113/ab952af5-a3e1-4f6c-b7b5-c8f6f0677222`.
It uses the unchanged `sha256=6ced9a...d56f7` template and proposes 2
additions, 10 in-place modifications, 0 removals, and 0 replacements. The
execution-role policy includes the three permissions discovered by the
earlier CloudFormation handler attempts and passes AWS Access Analyzer.

Retry 3 has not been executed or explicitly approved. Execution requires
fresh approval of this exact ARN; approval of any consumed earlier change set
does not apply.

## Historical superseded change-set inspection

The first change set reached `CREATE_COMPLETE` / `AVAILABLE` at
`2026-08-18T04:19:37.061Z`. It is an inspection artifact only and is not
approved for execution. It was superseded by the reconciled final proposal.

- Proposed actions: 12 additions and 11 removals.
- The existing Lightsail host and static IP, workload IAM user, and GitHub
  deployment role would be deleted.
- The existing media, backup, and deployment buckets and ECR repository have
  `Retain` policies. They would be orphaned from this stack while their bucket
  policies would be removed.
- The proposed template would add a GitHub OIDC provider even though the
  account already has `token.actions.githubusercontent.com` configured.
- The local template must be reconciled with the existing stack before a new
  exact change set can be proposed for execution approval.

## Current additive app-02 execution and inspection

The current change set reached `CREATE_COMPLETE` / `AVAILABLE` on
`2026-08-18T06:22:18Z` after the exact user approval. The change set was
executed successfully; no other change set was executed.

- Exact ARN:
  `arn:aws:cloudformation:ap-southeast-1:349762920349:changeSet/f08-t02-new-lightsail-20260818-0610/319fbc6f-e248-49ca-93aa-19c7d497be50`.
- Exact template digest: `sha256=3302ecb092f81e501115423eb576b5e1d8fecdb4db32e20432ddb162a67ca645`.
- Proposed actions: 4 additions, 10 in-place modifications, 0 deletions, and
  0 replacements.
- Stack execution result: `UPDATE_COMPLETE`; existing host/static IP are
  retained, new instance/static IP are `CREATE_COMPLETE`, and outputs record
  `mmdc-v3-development-app-02` with static IP `122.248.253.125`.
- Additions: `mmdc-v3-development-app-02`, its attached
  `mmdc-v3-development-ip-02`, and the two development Lightsail alarms.
- The existing `mmdc-v3-development-app` remains the existing physical
  resource with `Replacement=False`; the change set does include disclosed
  in-place retention/bootstrap/tag changes to it.
- Existing ECR, S3, IAM, and bucket-policy resources are also disclosed as
  in-place modifications from the current dirty repository template.
- Region is `ap-southeast-1`; bundle is `medium_3_0`; blueprint is
  `ubuntu_24_04`; availability zone is `ap-southeast-1a`; SSH is restricted
  to the approved single-operator `/32`; HTTP/HTTPS remain public on ports 80
  and 443; development edge remains disabled.
- CloudFormation execution role:
  `arn:aws:iam::349762920349:role/MMDCDevelopmentCloudFormationExecution`.
- No new host credential, Neon secret, application secret, or credential value
  is present in the template, parameters, outputs, or evidence.
- The post-execution CloudFormation template retains the approved
  `ap-southeast-1a`, `medium_3_0`, `ubuntu_24_04`, AutoSnapshot `18:00`,
  restricted SSH `/32`, public HTTP/HTTPS ports, required tags, and
  `Retain`/`UpdateReplacePolicy: Retain` on both instances. The additional
  static IP is attached to `DevelopmentInstanceAdditional` in the reviewed
  template.
- Direct `lightsail:GetInstance` verification was denied to the governed
  `MMDCIaacOperator`; no broader profile or IAM change was used. CloudFormation
  resource status, outputs, and the post-execution template are the retained
  non-secret verification.
- Host bootstrap/recreation completed through the external reviewed-artifact
  transfer and root/admin execution channel. No host secrets or runtime
  environment values were accessed; their later delivery remains a Phase 9
  responsibility.
