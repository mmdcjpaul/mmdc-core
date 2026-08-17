---
register: environment-allocation
version: 1.0
status: Active
accountable_owner: Engineering
last_reviewed: 2026-08-17
review_cadence: monthly and on every environment-boundary change
---

# Environment register

## Scope

This register defines the database, media, search, deployment, region, and
data-class boundaries for every planned environment. It is a boundary record,
not evidence that a provider resource or credential has been created.

## Accountable owner

Engineering owns the register. Product owns the data-class decision; AWS and
Neon own their provider-specific resource records when the guarded decisions
are approved.

## Records

| Environment | Database boundary | Media boundary | Search boundary | Deployment boundary | Region boundary | Data class and default data | Credential and role boundary | Decision state | Accountable role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local | Dedicated developer Neon branch by default, or the pinned local PostgreSQL 17 compatibility service; never a shared branch | Local filesystem by default; no shared bucket | Local pinned container and disposable index | Working tree only; no deployment target | Developer machine; hosted region is not selected by local work | Synthetic developer data only | Developer-local runtime credentials are isolated from CI, shared development, staging, and production | Blocked: the F00-T01 architecture boundary is recorded, but provider allocation is not an external approval | Engineering |
| CI | Disposable PostgreSQL 17 service per run; optional isolated Neon contract branch | Synthetic/local test storage only | Disposable pinned service and disposable index | None; CI validates artifacts and does not deploy from branch pushes | GitHub-hosted runner; no application region | Synthetic test data only | Ephemeral CI credentials, if required, are scoped to the run and never reused by a persistent environment | Blocked: the test boundary is recorded, but external service choice requires CI implementation | Engineering |
| Development | Dedicated non-production Neon project/root branch; no production database or role | Dedicated private development S3 bucket | Dedicated development service/index on Lightsail | Immutable `vX.Y.Z-dev.N` digest pulled by the development host | `ap-southeast-1` is the plan target; final AWS selection is Blocked until accountable approval | Synthetic data by default; no production data import without a separate approval | Development-only roles, buckets, search keys, and application secrets | Blocked: AWS region, Neon plan/restore window, and final resource allocation require named approval | AWS / Neon |
| Staging | Separate Neon project or independently restorable non-production root branch; never the production database | Separate private staging bucket | Separate staging service/index and keys | Immutable `vX.Y.Z-rc.N` digest through the approved deployment environment | Singapore region target; final selection is Blocked until accountable approval | Synthetic or separately authorized pre-production data; never an implicit production copy | Staging-only roles, buckets, search keys, and application secrets | Blocked: staging allocation and data-source decision require Product, AWS, Neon, and Security approval | Product / Engineering |
| Production | Separate paid Neon project in Singapore; no non-production branch, role, or credential sharing | Separate private production bucket | Production topology and keys separate from every non-production service | Stable immutable `vX.Y.Z` digest through protected deployment approval | Singapore / `ap-southeast-1` target; exact provider record is Blocked until accountable approval | Production-authorized content only; synthetic seed data is not the production default | Production-only roles, buckets, search keys, and application secrets; no developer or CI reuse | Blocked: plan, restore window, and production authorization require explicit accountable approval | Product / Engineering |

## Separation rules

The following boundaries are mandatory for every environment pair:

| Boundary | Rule | Proof required before use |
| --- | --- | --- |
| Credentials | Production and non-production credentials are different secret records and cannot be copied between scopes | Secret inventory scope review and provider access review |
| Roles | Runtime, migration, CI, host, and human roles are environment-scoped; production roles are never reused outside production | Ownership matrix plus least-privilege policy review |
| Databases | Production is a separate Neon project; development, staging, CI, and local work cannot target it by default | Connection-target guard and sanitized configuration review |
| Media buckets | Production, staging, development, and local/test media stores are separate; private buckets are not shared | Bucket policy and prefix/resource review |
| Search keys | Search admin/indexing and search query keys are environment-scoped; a production master key is never non-production input | Secret inventory and search access probe |
| Application secrets | Payload, preview, edge, deployment, and observability secrets are separate per persistent environment | Secret inventory scope and rotation record |
| Default data | Local, CI, development, and staging default data is synthetic; production data is never seeded into non-production | Seed guard and data-class review |

## Change and review

Engineering reviews this register monthly and whenever a database, media,
search, deployment, region, or data-class boundary changes. A change that
would connect production to non-production remains `Blocked` until the
Security owner and the affected provider owner record approval in the
ownership matrix and the relevant change record.
