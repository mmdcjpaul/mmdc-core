---
id: F03-T01
feature: F03 Local development
title: Provide isolated local services and database-target guards
autonomy: autonomous
---

# Provide isolated local services

## Intent

Support fast host-based application development with explicit, private dependency choices.

## Requirements

- **F03-T01-R01 — Ubiquitous:** Local Compose SHALL provide pinned Meilisearch and optional PostgreSQL 17 compatibility services while Next.js and Payload run on the host for fast refresh.
- **F03-T01-R02 — State-driven:** WHILE local defaults are active, media SHALL use local filesystem storage and synthetic fixtures without requiring AWS credentials.
- **F03-T01-R03 — Event-driven:** WHEN a developer selects PostgreSQL compatibility mode or an isolated Neon branch, configuration SHALL make the target explicit and visibly identify it before destructive commands.
- **F03-T01-R04 — Prohibition:** Local database selection SHALL NOT silently target a shared development, staging, or production database.
- **F03-T01-R05 — Prohibition:** Local PostgreSQL and Meilisearch SHALL NOT bind beyond loopback unless the developer makes a deliberate documented override.

## Acceptance criteria

- Compose configuration pins service versions and defaults to loopback-only ports.
- Local application start does not require AWS or shared-environment data.
- Target-guard tests reject shared hosts/names and require confirmation for explicit overrides.
- Both supported database modes have isolated smoke tests.

## Validation

`tests/acceptance/F03-T01.sh` shall inspect rendered Compose configuration and run local-storage, database-mode, network-binding, and destructive-target guard tests. Run `./validation.sh F03-T01`.

## Dependencies

F02-T02.

## Traces

Implementation Plan sections 6.1-6.2, Phase 3, and foundation scope boundary.
