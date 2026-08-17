---
id: F11-T01
feature: F11 Acceptance
title: Publish foundation evidence and gate the Article handoff
autonomy: guarded
---

# Publish foundation acceptance and Article handoff gate

## Intent

Close the foundation only when all gates are traceable, reproducible, signed off, and still exclude deferred product scope.

## Requirements

- **F11-T01-R01 — Event-driven:** WHEN foundation acceptance is proposed, a versioned report SHALL map every Phase 0-10 exit gate and every ticket requirement to passing evidence with Git SHA, image digest, environment, migration version, time, result, and retained artifact reference.
- **F11-T01-R02 — Event-driven:** WHEN evidence is missing, stale, contradictory, unsanitized, or associated with a different SHA/digest/environment, the acceptance report SHALL remain unapproved.
- **F11-T01-R03 — Ubiquitous:** Engineering and Product SHALL explicitly approve the shared development foundation and record unresolved production concerns as deferred decisions.
- **F11-T01-R04 — Prohibition:** Foundation acceptance SHALL NOT introduce or claim Article, archive, Pathfinder, calculator, Inquiry, generic-page, unapproved route, real/sensitive content, CRM, enrollment, analytics, or consent scope.
- **F11-T01-R05 — Event-driven:** WHEN the Article handoff is considered, it SHALL remain blocked until foundation acceptance and upstream CM-031/032/033, wireframe, schema, and governance gates have authentic approval evidence.
- **F11-T01-R06 — Optional:** WHERE all handoff gates are approved, the project SHALL create a separate Article vertical-slice implementation plan against the final Data Model, Discovery, IA, and component contracts.

## Acceptance criteria

- An evidence index has no missing requirement/gate and reconciles immutable identifiers.
- A clean-checkout rerun of all locally reproducible ticket validators succeeds.
- Scope scans and review confirm deferred features/data were not introduced.
- Engineering/Product signatures and upstream handoff approvals are authentic, dated, and sanitized; absent approvals leave the ticket failing.

## Validation

`tests/acceptance/F11-T01.sh` shall validate evidence completeness/identity, rerun safe local validators, scan deferred scope, and verify authentic approval records. Run `./validation.sh F11-T01`.

## Dependencies

F10-T03.

## Traces

Implementation Plan Phase 11, sections 2-3, 10, 14, and the Article handoff statement.
