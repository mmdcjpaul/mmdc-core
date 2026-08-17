---
id: F03-T02
feature: F03 Local development
title: Provide the repeatable developer command contract
autonomy: autonomous
---

# Provide the developer workflow

## Intent

Make a clean checkout independently usable through stable, documented commands.

## Requirements

- **F03-T02-R01 — Ubiquitous:** The repository SHALL expose one documented command contract for setup, start, stop, seed, reset, type generation, migration create/apply, worker, search rebuild, test, typecheck, lint, build, and container smoke.
- **F03-T02-R02 — Event-driven:** WHEN setup runs more than once, it SHALL remain safe and converge on the same local state.
- **F03-T02-R03 — Event-driven:** WHEN a second developer follows the README from a clean checkout on a supported workstation, setup and reset SHALL complete without undocumented state.
- **F03-T02-R04 — Event-driven:** WHEN a command fails because a prerequisite is missing, it SHALL report an actionable error without exposing a secret.

## Acceptance criteria

- Command names in documentation exactly match executable package or task-runner commands.
- A clean-checkout harness executes setup, start/health, seed, reset, and stop twice.
- Supported workstation prerequisites and measured setup/reset times are recorded.
- Documentation explains isolated Neon credentials and the local PostgreSQL alternative.

## Validation

`tests/acceptance/F03-T02.sh` shall lint documented commands and run the repeatable clean-checkout workflow in an isolated temporary worktree/environment. Run `./validation.sh F03-T02`.

## Dependencies

F03-T01.

## Traces

Implementation Plan Phase 3, planned repository shape, and reproducibility evidence row.
