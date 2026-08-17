---
id: F06-T01
feature: F06 Production runtime
title: Build the hardened immutable application image
autonomy: autonomous
---

# Build the production application image

## Intent

Produce one minimal, immutable, glibc-based image for both web and worker processes.

## Requirements

- **F06-T01-R01 — Ubiquitous:** The application image SHALL use a multi-stage build, the exact approved Node 24 Debian bookworm digest, and Next standalone output.
- **F06-T01-R02 — Ubiquitous:** The runtime SHALL execute as a non-root user with a read-only root filesystem wherever verified compatible.
- **F06-T01-R03 — Event-driven:** WHEN the same digest starts with the web or worker command, it SHALL run the corresponding process without an environment-specific rebuild.
- **F06-T01-R04 — Event-driven:** WHEN configuration is supplied at runtime, the image SHALL start without embedded environment credentials or hosted-service access during build.
- **F06-T01-R05 — Prohibition:** The runtime image SHALL NOT contain `.env` files, source credentials, build secrets, package-manager caches, source-only toolchains, or unnecessary package sources.
- **F06-T01-R06 — Event-driven:** WHEN Sharp transforms an image in the runtime container, the glibc-native operation SHALL succeed on the pinned version.

## Acceptance criteria

- Image-history and filesystem scans find no representative secret or prohibited file class.
- The runtime user is non-root and write locations are explicitly bounded.
- One locally resolved digest passes both web and worker start probes with runtime-injected configuration.
- Sharp and Next standalone runtime smoke tests pass.

## Validation

`tests/acceptance/F06-T01.sh` shall build once, inspect the image, scan for secrets/prohibited content, and run non-root, read-only, web, worker, runtime-config, and Sharp probes. Run `./validation.sh F06-T01`.

## Dependencies

F04-T02 and F05-T02.

## Traces

Implementation Plan version baseline, Phase 6, test matrix compatibility/security, and runtime compatibility risk.
