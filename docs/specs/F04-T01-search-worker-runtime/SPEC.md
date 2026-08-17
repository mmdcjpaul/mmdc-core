---
id: F04-T01
feature: F04 Search and worker
title: Establish Meilisearch key boundaries and the worker process
autonomy: autonomous
---

# Establish search and worker runtime boundaries

## Intent

Run search and asynchronous Payload jobs as private services with least-privilege credentials.

## Requirements

- **F04-T01-R01 — State-driven:** WHILE Meilisearch runs in a shared environment, it SHALL use the pinned production-mode image/digest and a protected master key.
- **F04-T01-R02 — Ubiquitous:** The system SHALL define separate master, admin/indexing, and search-only key scopes appropriate to their callers.
- **F04-T01-R03 — Prohibition:** The application SHALL NOT send a master or admin/indexing key to a browser or expose Meilisearch directly to the public network.
- **F04-T01-R04 — Ubiquitous:** Payload jobs SHALL run in a separate worker process using the same application image and configuration contract as the web process.
- **F04-T01-R05 — Event-driven:** WHEN the worker is interrupted or restarted, job leasing/retry behavior SHALL be bounded, observable, and recoverable.

## Acceptance criteria

- Rendered client bundles and public responses contain no privileged key sentinel.
- Key-policy integration tests prove permitted and denied Meilisearch actions.
- Web and worker commands are distinct while their image/runtime contract is shared.
- Forced worker interruption demonstrates recoverable job execution without unbounded duplication.

## Validation

`tests/acceptance/F04-T01.sh` shall run key-boundary, bundle-leak, private-network, worker-command, retry, and interruption tests. Run `./validation.sh F04-T01`.

## Dependencies

F03-T02.

## Traces

Implementation Plan architecture boundaries, Phase 4, Phase 6, and search/security evidence rows.
