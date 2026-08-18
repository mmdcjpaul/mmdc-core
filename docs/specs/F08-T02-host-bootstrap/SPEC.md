---
id: F08-T02
feature: F08 AWS infrastructure
title: Bootstrap and approve reproducible host provisioning
autonomy: guarded
---

# Bootstrap and approve the development host

## Intent

Make a fresh Lightsail host reproducible from reviewed definitions without compiling source on the host.

## Requirements

- **F08-T02-R01 — Event-driven:** WHEN a fresh development host boots, version-controlled bootstrap SHALL install/configure Docker Engine and Compose, Caddy, the pull deployment agent, protected runtime environment files, log rotation, and approved backup tooling.
- **F08-T02-R02 — Prohibition:** The host bootstrap SHALL NOT embed source credentials, Neon secrets, application secrets, or unbounded AWS credentials in source, CloudFormation user data, output, or logs.
- **F08-T02-R03 — Event-driven:** WHEN infrastructure change is proposed, operators SHALL verify the `mmdc-iaac` assumed-role AWS identity, validate/lint, create and inspect a change set, review region/names/bundle/ports/IAM/costs/deletion/tags, and obtain explicit approval for that exact change set before execution.
- **F08-T02-R04 — Event-driven:** WHEN a host is recreated, it SHALL reach deployment-ready state from CloudFormation and the bootstrap runbook without manual source compilation.
- **F08-T02-R05 — Prohibition:** The autonomous loop SHALL NOT execute a change set or fabricate provisioning/approval evidence.

For this ticket, `deployment-ready` means Phase 8 readiness-ready: the host
has completed the reviewed bootstrap, protected environment-file locations and
service boundaries are in place, and the pull agent is enabled and ready to
receive a later approved release. Phase 9 owns runtime secret delivery,
immutable image publication, desired state, deployment transitions, and release
health evidence. Their absence is therefore not an F08-T02 failure and must not
be satisfied with invented values.

## Acceptance criteria

- Bootstrap is idempotent in a disposable host-image test and leaves required secret files root-readable only.
- A sanitized change-set checklist records identity, template digest, cost, approver, timestamp, and non-secret outputs.
- Recreation evidence proves installed versions, private service boundaries, deployment readiness, and no host source build.
- Missing approval or cloud authority keeps this ticket failing.

## Validation

`tests/acceptance/F08-T02.sh` shall test bootstrap idempotency in isolation and validate authentic, sanitized, digest-bound approval/recreation evidence. Run `./validation.sh F08-T02`.

## Dependencies

F08-T01 and F00-T02.

## Traces

Implementation Plan Phase 8 pre-provisioning gate and exit gate, rollback host failure policy, and decisions 3, 7, and 8.
