---
id: F00-T02
feature: F00 Project controls
title: Establish ownership, environment, secret, cost, and policy registers
autonomy: guarded
---

# Establish project registers and policies

## Intent

Give every environment, secret class, approval, cost, and repository control an accountable owner without storing secret values.

## Requirements

- **F00-T02-R01 — Ubiquitous:** The repository SHALL define an environment register covering local, CI, development, staging, and production database, media, search, deployment, region, and data-class boundaries.
- **F00-T02-R02 — Ubiquitous:** The repository SHALL define an ownership and approval matrix for Engineering, Product, AWS, Neon, DNS, security, migrations, deployments, restores, and break-glass actions.
- **F00-T02-R03 — Ubiquitous:** The repository SHALL define a secret inventory containing names, environment scope, owner, storage location, rotation rule, and exposure response without secret values.
- **F00-T02-R04 — Event-driven:** WHEN a branch or semantic deployment tag is created, repository policy SHALL enforce the approved protection, reachability, review, and required-check rules.
- **F00-T02-R05 — Ubiquitous:** The repository SHALL record estimated monthly costs plus deletion, retention, expiry, and review policies for Neon branches, S3 versions, ECR images, Lightsail state, logs, and evidence.
- **F00-T02-R06 — Prohibition:** Project registers SHALL NOT couple production and non-production credentials, roles, databases, media buckets, search keys, application secrets, or default data.

## Acceptance criteria

- Versioned register documents cover every named subject and identify accountable roles.
- Branch/tag policy names stable required checks and deployment approval ownership.
- Secret scanning confirms no register contains credential-shaped values.
- Guarded decisions are explicitly `Approved` with approver/date or `Blocked`; they are never silently defaulted.

## Validation

`tests/acceptance/F00-T02.sh` shall lint register schemas, coverage, separation rules, approval fields, and secret absence. Run `./validation.sh F00-T02`.

## Dependencies

F00-T01.

## Traces

Implementation Plan sections 6.1, 9, Phase 0, Phase 7, Phase 8, risks, and decisions 1-8.
