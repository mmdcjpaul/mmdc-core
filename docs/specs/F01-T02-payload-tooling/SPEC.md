---
id: F01-T02
feature: F01 Reproducible scaffold
title: Integrate Payload, environment validation, and quality commands
autonomy: autonomous
---

# Integrate Payload and foundation tooling

## Intent

Prove that Payload and the frontend share one Next.js process while keeping build-time configuration safe and repeatable.

## Requirements

- **F01-T02-R01 — Ubiquitous:** The application SHALL expose Payload Admin and API routes in `(payload)` and the public shell in `(frontend)` within the same App Router application.
- **F01-T02-R02 — Event-driven:** WHEN configuration is loaded at runtime, server environment validation SHALL distinguish required secrets, internal values, and explicitly public `NEXT_PUBLIC_` values.
- **F01-T02-R03 — Prohibition:** The application SHALL NOT place credentials, internal endpoints, or server-only configuration in a generated client bundle.
- **F01-T02-R04 — Event-driven:** WHEN the production build runs without database credentials or network access to a hosted database, the build SHALL complete successfully.
- **F01-T02-R05 — Ubiquitous:** The repository SHALL expose documented commands for formatting, linting, type generation, unit tests, type checking, and production build.
- **F01-T02-R06 — Event-driven:** WHEN the compatibility suite runs, it SHALL prove frontend boot, Admin login boot, a Payload Local API probe, Sharp image processing, and dependency/license/security triage.

## Acceptance criteria

- Admin login and public shell boot without introducing product features.
- Invalid/missing runtime values fail safely, while build-time database absence does not.
- A bundle scan finds no representative server-only sentinel.
- All quality commands and the compatibility suite return zero on the pinned matrix.

## Validation

`tests/acceptance/F01-T02.sh` shall run environment, route, bundle-leak, DB-independent build, command, Admin, Local API, and Sharp checks. Run `./validation.sh F01-T02`.

## Dependencies

F01-T01.

## Traces

Implementation Plan Phase 1, sections 5 and 9, test matrix compatibility/rendering/security rows, and risk “Build accidentally contacts shared Neon or S3”.
