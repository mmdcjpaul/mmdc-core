---
id: F04-T02
feature: F04 Search and worker
title: Implement idempotent projection, rebuild, and failure behavior
autonomy: autonomous
---

# Implement the synthetic search projection

## Intent

Prove disposable derived search state without introducing product search scope.

## Requirements

- **F04-T02-R01 — Ubiquitous:** The foundation SHALL implement only a synthetic versioned search projection with idempotent upsert and delete jobs.
- **F04-T02-R02 — Unwanted behavior:** IF a queued job represents an older canonical version than the indexed or current record, THEN the worker SHALL discard it without overwriting newer state.
- **F04-T02-R03 — Event-driven:** WHEN an operator invokes search rebuild, the system SHALL build a versioned index entirely from Neon and atomically swap the approved alias after validation.
- **F04-T02-R04 — Event-driven:** WHEN Meilisearch is deleted or empty, the rebuild command SHALL restore the derived index without altering canonical PostgreSQL records.
- **F04-T02-R05 — Unwanted behavior:** IF search is unavailable, THEN the server SHALL return the intentional sanitized recovery state and emit an observable failure signal.
- **F04-T02-R06 — Prohibition:** The foundation projection SHALL NOT implement unapproved Article fields, discovery ranking, or browser-owned failure behavior.

## Acceptance criteria

- Integration tests cover duplicate upsert/delete, reordered jobs, stale jobs, rebuild, swap failure, restart/retry, and unavailability.
- A canonical-data checksum is unchanged by index deletion and rebuild.
- Operator documentation identifies index versions and recovery commands.

## Validation

`tests/acceptance/F04-T02.sh` shall execute the search/job integration scenarios against disposable PostgreSQL and Meilisearch services. Run `./validation.sh F04-T02`.

## Dependencies

F04-T01.

## Traces

Implementation Plan Phase 4, architecture canonical-data boundary, rollback policy, and search evidence row.
