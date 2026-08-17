---
register: secret-inventory
version: 1.0
status: Active
accountable_owner: Security
last_reviewed: 2026-08-17
review_cadence: monthly and immediately after suspected exposure
---

# Secret inventory

## Scope

This inventory records secret names, scopes, owners, storage classes, rotation
rules, and exposure responses. It deliberately contains no secret values,
examples, connection strings, hashes, tokens, or credentials.

## Accountable owner

Security owns the inventory and the exposure-response procedure. Each
environment owner is accountable for rotating the records in its scope.

## Records

| Secret name or secret class | Environment scope | Owner role | Storage location class | Rotation rule | Exposure response |
| --- | --- | --- | --- | --- | --- |
| `PAYLOAD_SECRET` | Separate local, CI, development, staging, and production records | Engineering | Local protected environment file; CI/GitHub environment secret; persistent environment secret store | On suspected exposure and at the monthly security review; never copy across environments | Revoke/replace the affected record, invalidate sessions as applicable, inspect sanitized logs, and record the incident |
| `PAYLOAD_PREVIEW_SECRET` | Separate development, staging, and production records; local/CI synthetic records | Engineering | Protected environment secret store | Rotate on exposure or preview-signing policy change; review monthly | Revoke/replace, invalidate preview links, inspect logs, and record the incident |
| `DATABASE_URL` | Runtime pool URL per local, CI, development, staging, and production environment | Neon owner | Environment secret store; never repository or image | Rotate the scoped database credential after exposure or role change; review monthly | Revoke the role/password, issue a replacement, verify pool isolation, and inspect connection logs |
| `DATABASE_DIRECT_URL` | Migration/admin URL per CI, development, staging, and production environment | Migration owner (Engineering) | Protected migration job or environment secret store | Rotate after exposure, migration-role change, or restore event; review monthly | Revoke the migration credential, stop migration jobs, issue a replacement, and inspect audit records |
| `NEON_RUNTIME_ROLE_PASSWORD` | Separate persistent-environment runtime roles | Neon owner | Neon-approved secret store referenced by the environment secret store | Rotate after exposure and at the approved provider interval; review monthly | Revoke the role credential, verify runtime role privileges, issue a replacement, and record evidence |
| `NEON_MIGRATION_ROLE_PASSWORD` | Separate CI, development, staging, and production migration roles | Neon owner and Migration owner | Protected migration secret store | Rotate after exposure, restore, or schema-owner change; review monthly | Revoke the role credential, halt migration access, issue a replacement, and review audit records |
| `MEILI_ADMIN_KEY` | Separate local, CI, development, staging, and production search services | Engineering | Protected environment secret store | Rotate after exposure, service replacement, or monthly review | Revoke the admin key, issue a replacement, verify indexes, and inspect search access logs |
| `MEILI_SEARCH_KEY` | Separate local, CI, development, staging, and production query scopes | Engineering | Public-key configuration for the scoped environment; value remains managed as a secret record | Rotate after exposure or search policy change; review monthly | Revoke the query key, issue a replacement, and verify no production key crossed environments |
| `S3_WORKLOAD_IDENTITY_OR_CREDENTIAL` | Separate development, staging, and production media workloads; CI uses a disposable test scope | AWS owner | Workload identity or approved secret store; never image or repository | Prefer identity rotation; otherwise rotate after exposure and at the provider review interval | Disable/revoke the identity, issue a replacement, inspect object access, and preserve sanitized evidence |
| `HOST_AWS_PULL_CREDENTIAL` | Development host only, if the approved Lightsail bootstrap pattern requires it | AWS owner | Root-readable protected host runtime file or approved retrieval mechanism | Replace on exposure or host recreation; verify replacement before revoking old access | Immediately revoke, re-bootstrap through the approved channel, verify bounded ECR/state access, and record the incident |
| `DEPLOYMENT_STATE_INTEGRITY_KEY` | Development deployment-state publisher and verifier only | Deployment owner (Engineering) | Protected GitHub environment and host verifier secret store | Rotate after exposure or signing-policy change; review each release | Reject unverified state, revoke/replace the key, and audit desired-state objects |
| `EDGE_BASIC_AUTH_CREDENTIAL` | Development edge only; staging/production records are separate if approved | Security owner | Protected edge secret store or approved credential reference | Rotate after exposure and at the monthly edge review | Disable the credential, issue a replacement, inspect access logs, and record the incident |
| `CLOUDFRONT_ORIGIN_VERIFY_VALUE` | Development edge and origin pair only; separate per persistent environment | DNS owner and Security owner | Protected edge/origin secret store | Rotate after exposure or origin change; verify both sides before revocation | Replace both sides atomically, reject old-header traffic, inspect edge logs, and record evidence |
| `OBSERVABILITY_DESTINATION_CREDENTIAL` | Separate CI, development, staging, and production destinations | Security owner | Approved observability secret store | Rotate after exposure or destination change; review monthly | Revoke/replace, inspect transmitted metadata, and confirm logs contain no secret values |

## Non-disclosure and separation rules

Only the names and handling metadata above may be committed. The inventory
contains no secret values, examples, connection strings, hashes, tokens, or
credentials. Secret values,
private keys, credential-shaped URLs, bearer values, hashes, and generated
configuration are prohibited in this register and in every project register.
Production records must not be reused by local, CI, development, or staging;
non-production records must not be promoted into production.

## Change and review

Security reviews every row monthly and immediately after a suspected
exposure. A newly introduced secret class must be added with an environment
scope, owner role, storage class, rotation rule, and exposure response before
the consuming code is merged.
