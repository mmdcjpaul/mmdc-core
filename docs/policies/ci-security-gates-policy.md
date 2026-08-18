---
policy: ci-security-gates
version: 1.0
status: Active
accountable_owner: Engineering
last_reviewed: 2026-08-18
review_cadence: on every workflow or scan change and monthly
---

# CI security-gates policy

This policy is the repository contract for untrusted pull requests, CI
evidence, and the stable merge checks. It does not claim that external GitHub
branch-protection settings have been configured.

## Untrusted events

The workflow uses `pull_request` for pull-request validation. Forked pull
requests are treated as untrusted: protected AWS, Neon, deployment, and
persistent-environment credentials are excluded from their effective
environment. CI-only disposable values are not protected credentials and are
never reused by a persistent environment.

## Cache and concurrency

Dependency caches are keyed by runner, exact Node.js version, exact pnpm
version, and `pnpm-lock.yaml`, with no broad restore key. Superseded branch
quality work may be cancelled. Migration, container smoke, and deployment
work must use non-cancelling concurrency; a future deployment workflow must
preserve that rule.

## Evidence retention

Every CI artifact upload uses `retention-days: 14`, `if: always()`, and a
deterministic artifact name/path. The retained evidence set includes test
reports, SBOM, secret/dependency/license/IaC/container scan results, image
metadata, and sanitized logs. Artifact and log writers redact credential-shaped
values before serialization. This repository policy does not claim provider
billing, external artifact lifecycle configuration, or a human approval.

## Scan gates

Secret, dependency, license, IaC, and container scans are blocking checks.
An untriaged blocking finding or an injected scan failure makes
`security-scans` fail. Reports retain finding type and file/line context but
never the matched credential value.
