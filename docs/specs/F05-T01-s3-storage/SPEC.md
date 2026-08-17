---
id: F05-T01
feature: F05 Media storage
title: Provision private S3 storage and integrate the Payload adapter
autonomy: guarded
---

# Integrate private S3 media storage

## Intent

Keep media durable across application replacement while preserving a credential-free local default.

## Requirements

- **F05-T01-R01 — State-driven:** WHILE a hosted environment is active, the Payload `media` collection SHALL store bytes through the S3 adapter in a dedicated private per-environment bucket.
- **F05-T01-R02 — State-driven:** WHILE local defaults are active, uploads SHALL use local filesystem storage without AWS credentials.
- **F05-T01-R03 — Ubiquitous:** Buckets SHALL enforce encryption, versioning, public-access block, approved lifecycle, collision-safe deterministic object keys, and environment isolation.
- **F05-T01-R04 — Ubiquitous:** The application identity SHALL have only required object operations for its bucket/prefix.
- **F05-T01-R05 — Prohibition:** The application identity SHALL NOT administer bucket policy, encryption, lifecycle, unrelated prefixes, or other environment buckets.
- **F05-T01-R06 — Optional:** WHERE CloudFront origin access is approved for media delivery, the system SHALL keep the bucket private and grant delivery access only through the approved origin identity/control.

## Acceptance criteria

- Policy tests prove public list/write denial and application allow/deny boundaries.
- Local and hosted adapter selection is explicit and tested.
- Object keys are stable for a record/variant, collision-safe across records, and do not expose secret input.
- Replacing the application container preserves uploaded media.

## Validation

`tests/acceptance/F05-T01.sh` shall run policy/IaC checks, adapter-selection tests, object-key tests, and a restart/replacement persistence test using an approved disposable S3 target or emulator. Run `./validation.sh F05-T01`.

## Dependencies

F02-T01 and F00-T02.

## Traces

Implementation Plan sections 4, 6.1, Phase 5, configuration plan, and media/security evidence rows.
