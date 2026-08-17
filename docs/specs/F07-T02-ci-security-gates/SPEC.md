---
id: F07-T02
feature: F07 CI quality
title: Harden CI permissions, scans, artifacts, and merge gates
autonomy: guarded
---

# Harden CI security and merge gates

## Intent

Keep untrusted changes away from secrets and make quality evidence durable and required.

## Requirements

- **F07-T02-R01 — Ubiquitous:** GitHub workflow permissions SHALL default to read-only and grant each job only the minimum additional permissions it requires.
- **F07-T02-R02 — Prohibition:** Forked or otherwise untrusted pull requests SHALL NOT receive AWS, Neon, deployment-environment, or other protected credentials.
- **F07-T02-R03 — Event-driven:** WHEN safe branch work is superseded, CI SHALL cancel the older run; WHEN a migration or deployment is active, concurrency policy SHALL NOT cancel it into an unsafe state.
- **F07-T02-R04 — Event-driven:** WHEN CI completes, it SHALL retain test reports, SBOM, secret/dependency/license/IaC/container scan results, and image metadata according to policy.
- **F07-T02-R05 — Event-driven:** WHEN a scan reports an untriaged blocking finding, the protected merge gate SHALL fail.
- **F07-T02-R06 — Ubiquitous:** Branch protection documentation SHALL require the stable checks approved in the project policy for `development` and `main`.

## Acceptance criteria

- Static policy tests prove permissions, secret-event isolation, safe cache keys, artifact retention, scan coverage, and concurrency semantics.
- A fork-event simulation sees no protected secret.
- Required-check documentation exactly matches workflow job names and approved branch policy.
- Sanitization tests prevent credential-shaped values in logs and artifacts.

## Validation

`tests/acceptance/F07-T02.sh` shall run workflow security/policy tests, fork simulation, scan failure injection, artifact/log sanitization, and branch-check reconciliation. Run `./validation.sh F07-T02`.

## Dependencies

F07-T01 and F00-T02.

## Traces

Implementation Plan Phase 7, sections 8-10, configuration rules, and CI required proof.
