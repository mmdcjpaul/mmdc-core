---
id: F00-T01
feature: F00 Project controls
title: Record architecture and access decisions
autonomy: guarded
---

# Record architecture and access decisions

## Intent

Make durable foundation choices explicit before scaffold or cloud work depends on them.

## Requirements

- **F00-T01-R01 — Ubiquitous:** The repository SHALL contain an accepted ADR stating that Neon PostgreSQL replaces colocated shared-environment PostgreSQL and describing canonical data, connection, backup, and restore boundaries.
- **F00-T01-R02 — Ubiquitous:** The repository SHALL contain an accepted ADR selecting the Lightsail host authentication and pull-deployment design with least-privilege ECR and deployment-state access.
- **F00-T01-R03 — Event-driven:** WHEN a decision creates a durable operational consequence, the project SHALL record its owner, rationale, alternatives, consequences, and approval state in an ADR.
- **F00-T01-R04 — Prohibition:** The autonomous implementation SHALL NOT invent approval, account, hostname, region, plan, restore-window, or authentication decisions that lack accountable human confirmation.

## Acceptance criteria

- Both ADRs use the repository ADR template and have no unresolved placeholder in an accepted section.
- Neon canonical-data and restore responsibilities match Implementation Plan sections 3.2, 4, and 6.
- The host-authentication ADR names granted actions, credential/bootstrap handling, rotation, and rejected alternatives.
- A test fails if either ADR is missing, unapproved, internally contradictory, or contains `TBD` in a required decision field.

## Validation

`tests/acceptance/F00-T01.sh` shall lint the ADR structure and assert the required decisions and prohibitions. Run `./validation.sh F00-T01`.

## Dependencies

None.

## Traces

Implementation Plan sections 3.2, 4, 6.2, 6.3, Phase 0, risks, and decisions 1-4.
