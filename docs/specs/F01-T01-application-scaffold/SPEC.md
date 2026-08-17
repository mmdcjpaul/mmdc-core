---
id: F01-T01
feature: F01 Reproducible scaffold
title: Create the exact-version Next.js application scaffold
autonomy: autonomous
---

# Create the exact-version application scaffold

## Intent

Create a reproducible greenfield Next.js foundation with the approved runtime and package matrix.

## Requirements

- **F01-T01-R01 — Ubiquitous:** The application SHALL use TypeScript, Next.js App Router, React, Tailwind, ESLint, and the approved `src` alias and route-group conventions.
- **F01-T01-R02 — Ubiquitous:** The manifest SHALL pin Node `24.15.0`, pnpm `11.20.0`, Next `16.3.1`, React and React DOM `19.2.8`, Payload and all `@payloadcms/*` packages `3.88.0`, and Sharp `0.34.5` exactly.
- **F01-T01-R03 — Event-driven:** WHEN dependencies are installed from a clean checkout, pnpm SHALL use the frozen committed lockfile and produce no manifest or lockfile change.
- **F01-T01-R04 — Event-driven:** WHEN setup or CI detects a different Node or package-manager version, validation SHALL fail with an actionable message.
- **F01-T01-R05 — Ubiquitous:** Next configuration SHALL enable standalone output for a later production image.
- **F01-T01-R06 — Prohibition:** The scaffold SHALL NOT add Pages Router routes, unapproved product routes, Article features, real content, or version ranges for the approved framework matrix.

## Acceptance criteria

- Clean frozen installation succeeds on the pinned runtime.
- The minimal frontend shell renders through App Router.
- Package-policy tests reject a changed pin, version range, wrong package manager, or Pages Router file.
- The lockfile is committed and reproducible.

## Validation

`tests/acceptance/F01-T01.sh` shall run pin/policy tests, frozen installation, lint/type checks available at this stage, and a frontend smoke test. Run `./validation.sh F01-T01`.

## Dependencies

F00-T01.

## Traces

Implementation Plan sections 3.1, 3.3, 5, Phase 1, and test matrix reproducibility/compatibility rows.
