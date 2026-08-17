---
id: F10-T02
feature: F10 Operations
title: Establish observability, alerts, and operational runbooks
autonomy: guarded
---

# Establish observability and runbooks

## Intent

Make release behavior and operational failure diagnosable without leaking governed data.

## Requirements

- **F10-T02-R01 — Ubiquitous:** Structured logs SHALL include release identifiers and correlation IDs for web, worker, search jobs, migrations, and deployments.
- **F10-T02-R02 — Prohibition:** Logs, metrics, errors, and retained evidence SHALL NOT contain passwords, connection strings, tokens, Basic Auth values, private headers, or complete form payloads.
- **F10-T02-R03 — Ubiquitous:** Observability SHALL cover deployment status, queue/search failures, Neon connection/latency, HTTP health, host CPU/RAM/disk, Meilisearch disk, and backup/recovery outcomes.
- **F10-T02-R04 — Event-driven:** WHEN a monitored threshold or synthetic failure is triggered, an alert SHALL reach the named accountable channel with environment, release, correlation, severity, and runbook context.
- **F10-T02-R05 — Ubiquitous:** Versioned runbooks SHALL cover deploy, rollback, migration failure, Neon outage/restore, search rebuild, media recovery, secret rotation, and host recreation.
- **F10-T02-R06 — Event-driven:** WHEN a runbook changes a durable external system, it SHALL identify prerequisites, approval, safe-state check, verification, rollback, evidence, and escalation owner.

## Acceptance criteria

- Schema tests validate structured log fields and redaction using representative secret formats.
- Every required signal has source, threshold/condition, owner, destination, and runbook mapping.
- Alert drills reach the approved channel and retain sanitized evidence.
- Runbook lint finds no missing operational scenario or required control field.

## Validation

`tests/acceptance/F10-T02.sh` shall run logging/redaction/metric tests and validate runbook coverage plus authentic sanitized alert-delivery evidence. Run `./validation.sh F10-T02`.

## Dependencies

F10-T01.

## Traces

Implementation Plan Phase 10 observability/runbook objectives, required proof, configuration plan, and rollback policy.
