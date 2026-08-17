---
id: F09-T03
feature: F09 Deployment
title: Prove deployment rejection, idempotency, audit, and recovery paths
autonomy: guarded
---

# Accept the immutable deployment path

## Intent

Produce auditable development evidence for every release and failure gate before edge acceptance.

## Requirements

- **F09-T03-R01 — Event-driven:** WHEN a development tag deploys, evidence SHALL trace repository/ref/workflow to Git SHA, ECR digest, desired-state digest, migration version, running web/worker digests, probe results, and final status.
- **F09-T03-R02 — Event-driven:** WHEN a rejection scenario is exercised, evidence SHALL show branch push, invalid tag/ref, wrong environment, duplicate/stale state, failed migration, and failed health each reaching its required safe result.
- **F09-T03-R03 — Ubiquitous:** Deployment logs and status SHALL be bounded, correlated, release-identified, and sanitized.
- **F09-T03-R04 — Prohibition:** Acceptance evidence SHALL NOT contain connection strings, passwords, tokens, Basic Auth values, complete form payloads, or fabricated cloud results.
- **F09-T03-R05 — Event-driven:** WHEN the exact approved development tag is exercised, the running host SHALL report the exact immutable digest without source compilation or inbound CI SSH.

## Acceptance criteria

- An automated evidence verifier reconciles all identifiers and detects substitution or missing stages.
- Negative-path evidence covers every required rejection and rollback/safe-state outcome.
- Authentic external evidence names environment, time, approver where required, and retained artifact references.
- Missing cloud access or approval blocks completion rather than producing synthetic acceptance.

## Validation

`tests/acceptance/F09-T03.sh` shall verify deployment scenario tests plus authentic, sanitized, identifier-consistent development evidence. Run `./validation.sh F09-T03`.

## Dependencies

F09-T02.

## Traces

Implementation Plan Phase 9 exit gate, test/evidence matrix deployment row, configuration rules, and definition of foundation complete.
