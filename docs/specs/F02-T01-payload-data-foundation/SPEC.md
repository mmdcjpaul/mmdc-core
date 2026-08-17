---
id: F02-T01
feature: F02 Payload and Neon
title: Configure Payload data model, migrations, and generated types
autonomy: autonomous
---

# Configure the Payload data foundation

## Intent

Establish the smallest governed Payload schema and a migration-first PostgreSQL lifecycle.

## Requirements

- **F02-T01-R01 — Ubiquitous:** Payload SHALL use `@payloadcms/db-postgres` with explicit bounded runtime pool and timeout configuration sourced from the pooled `DATABASE_URL`.
- **F02-T01-R02 — Ubiquitous:** The schema SHALL include authenticated `users` with the four approved functional role values and a governed `media` collection sufficient for foundation access and storage tests.
- **F02-T01-R03 — Prohibition:** The foundation schema SHALL NOT prematurely implement future Article collections, editorial scope rules, product routes, or unrequired drafts and versions.
- **F02-T01-R04 — Event-driven:** WHEN the schema changes, the repository SHALL commit the generated Payload types and a reviewable migration in the same change.
- **F02-T01-R05 — Event-driven:** WHEN deployment or shared-environment startup occurs, schema push SHALL be disabled and migrations SHALL run as a separately invoked, exactly-once operation.
- **F02-T01-R06 — Event-driven:** WHEN the initial migration runs against empty PostgreSQL 17 or an empty Neon branch, it SHALL apply successfully and be idempotently tracked.

## Acceptance criteria

- Schema and access probes cover all four roles, authentication, media metadata, versions/jobs needed by the foundation, and process restart persistence.
- Generated-type freshness is mechanically enforced.
- Empty local PostgreSQL and isolated Neon migration evidence is reproducible and sanitized.
- Shared-environment configuration cannot enable schema push.

## Validation

`tests/acceptance/F02-T01.sh` shall run schema/access tests, generated-file checks, empty-database migration tests, migration tracking, and shared-environment push rejection. Run `./validation.sh F02-T01`.

## Dependencies

F01-T02.

## Traces

Implementation Plan section 3.3, 6.2, Phase 2, PR 2, and database/security evidence rows.
