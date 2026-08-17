---
id: F05-T02
feature: F05 Media storage
title: Enforce governed media validation, delivery, and recovery
autonomy: guarded
---

# Enforce media governance and recovery

## Intent

Apply authoritative metadata and byte validation to upload, delivery, variants, deletion, and recovery.

## Requirements

- **F05-T02-R01 — Event-driven:** WHEN media is uploaded, the server SHALL validate allowed type, size, byte signature, required rights metadata, and required accessibility metadata before eligibility.
- **F05-T02-R02 — Prohibition:** The server SHALL NOT trust filename extension, browser MIME type, or client-only validation as proof of media eligibility.
- **F05-T02-R03 — Event-driven:** WHEN an authorized delivery request succeeds, the system SHALL serve only eligible media through the approved application or private CloudFront path.
- **F05-T02-R04 — Event-driven:** WHEN image variants are generated, their metadata and object keys SHALL be deterministic and recoverable from canonical Payload metadata and source media.
- **F05-T02-R05 — Event-driven:** WHEN deletion occurs, the system SHALL preserve recoverability according to bucket versioning/lifecycle and keep metadata/byte state consistent.
- **F05-T02-R06 — Unwanted behavior:** IF S3 is unavailable, THEN the system SHALL preserve Payload metadata, return the governed fallback, and emit an alert without fabricating public eligibility.

## Acceptance criteria

- Server tests reject invalid type, oversize content, signature mismatch, missing rights, and missing accessibility metadata.
- Upload, metadata read, authorized/unauthorized delivery, resize, restart, deletion, version recovery, and S3 outage scenarios pass.
- No write credential or private object URL appears in a browser bundle or public error.

## Validation

`tests/acceptance/F05-T02.sh` shall run media validation, access, transform, persistence, recovery, outage, and secret-leak scenarios. Run `./validation.sh F05-T02`.

## Dependencies

F05-T01.

## Traces

Implementation Plan Phase 5, rollback policy, configuration plan, and media evidence row.
