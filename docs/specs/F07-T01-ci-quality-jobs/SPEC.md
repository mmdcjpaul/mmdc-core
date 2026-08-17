---
id: F07-T01
feature: F07 CI quality
title: Implement reproducible quality, migration, integration, and image jobs
autonomy: autonomous
---

# Implement CI quality jobs

## Intent

Reproduce the complete foundation quality pipeline without developer-machine state.

## Requirements

- **F07-T01-R01 — Event-driven:** WHEN a pull request or protected-branch change runs CI, stable jobs SHALL check repository policy, formatting, lint, generated files, frozen install, and TypeScript.
- **F07-T01-R02 — Event-driven:** WHEN test jobs run, CI SHALL execute unit/schema tests, empty PostgreSQL 17 migration, and Payload/PostgreSQL/Meilisearch integration tests using disposable services.
- **F07-T01-R03 — Event-driven:** WHEN the production build job runs, it SHALL build Next without hosted database credentials or developer state.
- **F07-T01-R04 — Event-driven:** WHEN the container job runs, it SHALL build the production image once and execute the production-like health smoke against disposable dependencies.
- **F07-T01-R05 — Event-driven:** WHEN a migration fails, generated type is stale, Payload pin changes, or image health fails, the corresponding stable CI job SHALL fail.

## Acceptance criteria

- Workflow lint and local workflow tests prove job names, triggers, service versions, frozen install, and failure propagation.
- Each mandated failure is injected and observed as a blocking result.
- CI requires no local files or hosted environment credentials.
- Job commands reuse repository commands rather than divergent CI-only behavior.

## Validation

`tests/acceptance/F07-T01.sh` shall lint workflows and run or simulate every required job and injected failure with a local workflow harness. Run `./validation.sh F07-T01`.

## Dependencies

F06-T02.

## Traces

Implementation Plan Phase 7 planned jobs, Phase 1-6 proofs, and test/evidence matrix.
