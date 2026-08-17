---
id: F06-T02
feature: F06 Production runtime
title: Define Compose services, health, lifecycle, and smoke tests
autonomy: autonomous
---

# Define the production-like Compose runtime

## Intent

Exercise the deployable topology and failure behavior against disposable dependencies before AWS delivery.

## Requirements

- **F06-T02-R01 — Ubiquitous:** Production-like Compose SHALL define separate application, worker, Meilisearch, Caddy, and deployment-agent services with only Caddy intended as a public listener.
- **F06-T02-R02 — Ubiquitous:** The application SHALL expose sanitized liveness and readiness endpoints that distinguish a running process from dependency readiness.
- **F06-T02-R03 — Event-driven:** WHEN SIGTERM is received, web traffic SHALL drain and interrupted jobs SHALL remain recoverable.
- **F06-T02-R04 — Ubiquitous:** Services SHALL define reviewed restart policies, bounded resources, log rotation, and persistent Meilisearch storage.
- **F06-T02-R05 — Event-driven:** WHEN the production-like smoke suite runs, it SHALL use the exact application digest and disposable PostgreSQL, Meilisearch, and media dependencies.
- **F06-T02-R06 — Event-driven:** WHEN image scanning, SBOM generation, or policy evaluation finds an untriaged blocking issue, validation SHALL fail.

## Acceptance criteria

- Rendered Compose config has no unintended public app, worker, Meilisearch, or deployment-agent port.
- Liveness remains healthy during a simulated dependency outage while readiness fails safely.
- SIGTERM and job interruption tests pass.
- Container scan, SBOM, digest capture, service limits, log rotation, persistence, and end-to-end smoke produce retained local evidence.

## Validation

`tests/acceptance/F06-T02.sh` shall inspect Compose and execute health, outage, shutdown, recovery, persistence, scan, SBOM, and production-like smoke checks. Run `./validation.sh F06-T02`.

## Dependencies

F06-T01.

## Traces

Implementation Plan architecture, Phase 6, rollback policy, and container/deployment evidence rows.
