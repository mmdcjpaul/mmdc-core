---
id: F10-T03
feature: F10 Operations
title: Rehearse recovery and validate host capacity
autonomy: guarded
---

# Rehearse recovery and validate capacity

## Intent

Demonstrate that canonical data and services can be recovered in isolation and that the selected host fits measured workloads.

## Requirements

- **F10-T03-R01 — Event-driven:** WHEN Neon recovery is rehearsed, operators SHALL restore into an isolated branch/environment, validate schema/data/jobs, record recovery timing, and follow the approved cutover decision without touching the live branch.
- **F10-T03-R02 — Event-driven:** WHEN media recovery is rehearsed, operators SHALL restore a deleted/versioned object and reconcile it with canonical Payload metadata and delivery eligibility.
- **F10-T03-R03 — Event-driven:** WHEN Meilisearch is deleted, operators SHALL rebuild it from Neon, validate the versioned swap, and record completion time without changing canonical records.
- **F10-T03-R04 — Event-driven:** WHEN a host-loss rehearsal runs, the development host SHALL be recreated from CloudFormation/bootstrap, receive secrets through the approved channel, recover/rebuild Meilisearch, and run the last known-good digest.
- **F10-T03-R05 — Event-driven:** WHEN publication, search rebuild, preview, image processing, and representative request load run concurrently, host CPU/RAM/disk and dependency latency SHALL be measured against approved thresholds.
- **F10-T03-R06 — Unwanted behavior:** IF peak memory, disk, latency, or error rate exceeds an approved threshold, THEN foundation acceptance SHALL fail until capacity or workload policy is explicitly changed and retested.
- **F10-T03-R07 — Prohibition:** Recovery evidence SHALL NOT be generated against production or by destructive tests on live development canonical state.

## Acceptance criteria

- Sanitized evidence identifies environment, release/digest, migration, start/end, result, artifact references, approver, and isolation proof for every rehearsal.
- Checksums/counts demonstrate canonical-data integrity before and after search/media recovery.
- Capacity report includes workload, concurrency, peaks, thresholds, headroom, selected bundle, and accountable approval.
- Missing authentic rehearsal or threshold approval blocks completion.

## Validation

`tests/acceptance/F10-T03.sh` shall reconcile authentic sanitized recovery/capacity evidence and rerun safe automated integrity checks. Run `./validation.sh F10-T03`.

## Dependencies

F10-T02.

## Traces

Implementation Plan Phase 10, environment/recovery design, test/evidence operations row, risks, decisions 1 and 8, and definition of complete.
