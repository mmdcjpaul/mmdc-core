---
policy: branch-and-semantic-tag-protection
version: 1.0
status: Blocked
decision_state: Blocked
accountable_owner: Engineering repository owner
approver: None
approved_at: None
last_reviewed: 2026-08-17
review_cadence: on every repository-policy change and monthly
---

# Branch and semantic deployment-tag policy

## Scope

This is the versioned repository policy contract for protected branches and
semantic deployment tags. It describes the controls that the repository
settings and CI workflow must enforce. The external GitHub settings are not
claimed to be active until the blocked approval gate below is closed.

## Accountable owner

The Engineering repository owner maintains the settings. Engineering owns the
required checks and deployment workflow; Product owns product-release
approval; Security owns the security-gate definition.

## Branch creation and update rules

| Event | Required rule | Enforcement owner | Required evidence |
| --- | --- | --- | --- |
| A `development` branch is created or updated | Pull request, review by an authorized Engineering reviewer, no direct push, and every stable required check below must pass | Engineering repository owner | Protected-branch settings and a passing CI run |
| A `main` branch is created or updated | Pull request, two authorized reviewers including Product or Engineering, no direct push, and every stable required check below must pass | Engineering repository owner | Protected-branch settings and a passing CI run |
| Any other branch is created or updated | CI may validate the branch, but it cannot deploy, obtain persistent environment secrets, or bypass protected-branch checks | Engineering and Security | Workflow run proving no deployment path |

## Stable required checks

These names are the stable merge-gate contract and must not be silently
renamed. A check is required even when its implementation is temporarily
unavailable; an unavailable required check blocks the merge.

| Check name | Gate |
| --- | --- |
| `policy` | Repository policy, generated-file, and ticket-scope checks |
| `install` | Exact runtime and frozen dependency install |
| `typecheck` | TypeScript validation and generated-type freshness |
| `unit-schema` | Unit and schema tests |
| `migration` | Empty PostgreSQL migration contract |
| `integration` | Payload, PostgreSQL, Meilisearch, and access-control integration probes |
| `build` | Production Next build without hosted database credentials |
| `container-smoke` | Immutable production-like image health and smoke checks |
| `security-scans` | Secret, dependency, license, IaC, and container scan gates |

## Semantic deployment-tag rules

| Tag event | Required rule | Deployment approval owner | Required evidence |
| --- | --- | --- | --- |
| `vMAJOR.MINOR.PATCH-dev.N` is created | The commit must be reachable from `development`; all stable checks must pass; the protected Development environment approval must be recorded; CI publishes one immutable digest and no branch push deploys | Development deployment approver (Engineering) | Tag/ref validation, protected-environment approval, SHA-to-digest record, and host status |
| `vMAJOR.MINOR.PATCH-rc.N` is created | The commit must be reachable from `main` or the approved release branch; all stable checks must pass; staging approval must be recorded; only the immutable digest may deploy | Staging deployment approver (Engineering and Product) | Tag/ref validation, approval record, and SHA-to-digest record |
| `vMAJOR.MINOR.PATCH` is created | The commit must be reachable from `main`; all stable checks must pass; production approval must be recorded; no mutable `latest` tag or source build is accepted | Production deployment approver (Product, Engineering, and Security) | Tag/ref validation, protected-environment approvals, SHA-to-digest record, and deployment audit |
| Any malformed, unapproved, unreachable, or branch-only deployment event occurs | Reject the event and publish no deployment state, image promotion, or host change | Engineering and Security | Rejection status and sanitized workflow evidence |

## Guarded decision

`decision_state: Blocked` is intentional. The named rules are the repository
contract, but protected-branch settings, tag rules, reviewer assignments, and
deployment environments require the external GitHub owners to approve and
configure them. This document does not claim that configuration, credentials,
or a deployment has occurred. Once approved, this record must contain a named
approver and ISO date before `status` changes to `Active`.

## Change and review

Engineering reviews this policy monthly and on every required-check, branch,
tag, reviewer, or deployment-environment change. Security reviews secret and
permission consequences; Product reviews release and production approval
ownership.
