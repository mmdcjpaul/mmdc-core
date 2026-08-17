---
id: F10-T01
feature: F10 Operations
title: Enforce edge access and network isolation
autonomy: guarded
---

# Enforce development edge security

## Intent

Expose only the approved authenticated development edge while keeping origin and service ports private.

## Requirements

- **F10-T01-R01 — Ubiquitous:** CloudFront SHALL use the separate approved HTTPS origin hostname and supply a protected private origin-verification value to Caddy.
- **F10-T01-R02 — Event-driven:** WHEN a direct-origin request lacks or fails the private verification value, Caddy SHALL reject it before proxying to the application.
- **F10-T01-R03 — Event-driven:** WHEN an edge request passes origin verification, development access SHALL still require Caddy Basic Auth using the approved protected credential source.
- **F10-T01-R04 — State-driven:** WHILE development authentication is active, responses SHALL disable shared caching and emit approved `noindex` protections.
- **F10-T01-R05 — Ubiquitous:** Only ports 80 and 443 SHALL be public; SSH SHALL follow the approved restricted access path; application, worker, PostgreSQL, Meilisearch, and deployment-agent listeners SHALL remain private.
- **F10-T01-R06 — Prohibition:** Edge, Caddy, application, and access logs SHALL NOT record private origin values, Basic Auth values, session credentials, or complete authorization headers.

## Acceptance criteria

- Edge tests cover missing/wrong/right origin verification plus missing/wrong/right Basic Auth.
- Cache and robots/noindex checks pass for authenticated development responses.
- External and host-level port scans match the approved network policy.
- Sanitization tests prove protected header/credential values do not appear in logs or errors.

## Validation

`tests/acceptance/F10-T01.sh` shall run local edge simulations and validate authentic sanitized CloudFront/origin/network evidence. Missing approval or external evidence blocks completion. Run `./validation.sh F10-T01`.

## Dependencies

F09-T03.

## Traces

Implementation Plan Phase 10 edge objectives/proof, target architecture, secrets plan, and decision 4.
