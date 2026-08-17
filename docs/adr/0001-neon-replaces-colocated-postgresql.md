---
status: Accepted
decision: Neon PostgreSQL replaces colocated shared-environment PostgreSQL
owners:
  - Engineering and Product (role-level owner named by MMDC-WEB-PLAN-001)
approval_state: Accepted
approver: Jan Paul Fernandez
approved_at: 2026-08-17T08:16:31Z
---

# ADR-0001 — Neon replaces colocated PostgreSQL

## Context

The implementation plan supersedes the original colocated PostgreSQL design for
shared environments. This record makes the resulting data, connection, backup,
and restore boundaries explicit before application or cloud work depends on
them. It records the proposed architecture; it does not claim that the
unanswered Phase 0 decisions have been approved.

## Decision

### Owner

Engineering and Product own the decision at the role level, as named by
MMDC-WEB-PLAN-001. Jan Paul Fernandez is the accountable approver for this
development architecture decision.

### Rationale

Shared development and hosted environments use Neon PostgreSQL so database
recovery, branching, and managed PostgreSQL operations have an explicit
provider boundary. Local development may use a dedicated Neon developer branch
or the pinned local PostgreSQL compatibility service. The Payload PostgreSQL
adapter remains the standard `@payloadcms/db-postgres` adapter.

Development starts on the existing Neon Free account. The supplied connection
details will select a dedicated non-production project/branch at runtime; the
connection strings and embedded credentials are secrets and are never recorded
in this ADR or committed to Git. A paid plan and its recovery objectives remain
a separate production decision.

### Alternatives considered

- Colocated PostgreSQL on the Lightsail host was rejected by the implementation
  plan's Neon supersession: Lightsail hosts the application, worker, Caddy, and
  Meilisearch, but not the canonical shared-environment database.
- A Neon-specific HTTP application driver was rejected; the standard Payload
  Postgres adapter remains the application contract.
- Using the pooled connection for administrative work was rejected; migration,
  backup, restore, and schema-inspection work require the direct connection.

### Consequences

Canonical and disposable data boundaries are:

- Neon is canonical for CMS records, users, versions, and jobs.
- S3 is canonical for media bytes; Payload is canonical for media metadata and
  eligibility.
- Meilisearch indexes and Next.js caches are disposable derived state.
- The application and worker use the same image/configuration contract while
  connecting to Neon through bounded runtime pools.

The connection contract is:

- `DATABASE_URL` is the TLS-required pooled Neon URL for application and worker
  runtime traffic.
- `DATABASE_DIRECT_URL` is the TLS-required direct Neon URL used only for
  migrations, schema inspection, `pg_dump`, restore verification, and other
  administrative tasks.
- Pool limits, timeouts, transaction-pool compatibility, jobs, drafts/versions,
  locking, and suspend/wake behavior require explicit integration evidence.

The backup and restore boundary is:

- Neon Free is accepted for development without claiming a guaranteed restore
  window beyond the capabilities actually available to that account. Before a
  material or irreversible development migration, the operator takes a logical
  backup through `DATABASE_DIRECT_URL`; provider restore history may supplement
  but does not replace that backup.
- Each later persistent staging or production environment must have an
  explicitly approved restore window; a provider default is not sufficient.
- Material or irreversible changes require a pre-migration Neon restore point
  when supported and a logical backup through `DATABASE_DIRECT_URL`.
- A restore is first performed into a temporary isolated branch/environment,
  then validated, and only then follows an approved cutover procedure. A live
  branch is never used as the restore test target.
- Developer, CI, and temporary recovery branches have retention and automatic
  cleanup rules. Lightsail snapshots cover host state and non-canonical
  operational files only.

### Approval state

Accepted by Jan Paul Fernandez at 2026-08-17T08:16:31Z: use the existing Neon
Free account for a dedicated non-production development database, accept its
available recovery capabilities, and require logical backups before risky
migrations. The connection strings are runtime secrets and are not approval
evidence.

## Implementation boundaries

This ADR authorizes recording and testing the local connection/data contract
only after the decision is accepted. It does not authorize creating Neon
projects or branches, changing restore settings, running migrations against a
shared environment, creating backups, or performing a restore.

## Verification

Acceptance must verify the canonical ownership, pooled/direct connection
boundaries, backup/restore isolation, retention, and absence of contradictory
colocated-database claims. The approval record must retain the named approver
and timestamp above.
