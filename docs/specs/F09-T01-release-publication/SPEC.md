---
id: F09-T01
feature: F09 Deployment
title: Validate release tags and publish immutable ECR desired state
autonomy: guarded
---

# Publish an immutable development release

## Intent

Map an approved semantic development tag to one auditable image digest and integrity-checked desired state.

## Requirements

- **F09-T01-R01 — Event-driven:** WHEN a development release is requested, the workflow SHALL accept only `vMAJOR.MINOR.PATCH-dev.N` tags whose commit is reachable from `development`.
- **F09-T01-R02 — Prohibition:** Branch pushes, malformed tags, moved/reused tags, and unreachable commits SHALL NOT deploy.
- **F09-T01-R03 — Event-driven:** WHEN release CI passes, GitHub SHALL authenticate to AWS through the constrained OIDC role, publish the Git-SHA image once, resolve its ECR digest, and associate the immutable semantic tag with that digest.
- **F09-T01-R04 — Ubiquitous:** Release evidence SHALL bind Git SHA, semantic tag, image digest, SBOM, provenance, workflow identity, and environment.
- **F09-T01-R05 — Event-driven:** WHEN desired state is published, it SHALL be signed or integrity-checked and identify the exact environment, monotonic release value, image digest, migration command/version, and evidence references.
- **F09-T01-R06 — Prohibition:** The workflow SHALL NOT produce or consume `latest`, use a long-lived AWS access key, send secrets to untrusted events, or require inbound SSH to the host.

## Acceptance criteria

- Tag/ref tests cover valid and invalid formats, ancestry, reuse, branch push, and environment mismatch.
- ECR policy prevents tag mutation and retention follows the register.
- Desired-state schema/signature tests detect tampering, replay ordering, wrong environment, and mutable references.
- Publication dry-run evidence connects SHA through digest without deploying.

## Validation

`tests/acceptance/F09-T01.sh` shall run tag, ancestry, workflow/IAM, immutable publication, provenance, desired-state schema/integrity, and negative security tests. Run `./validation.sh F09-T01`.

## Dependencies

F08-T02.

## Traces

Implementation Plan Phase 9 objectives/sequence/proof, architecture, and tag/branch policy.
