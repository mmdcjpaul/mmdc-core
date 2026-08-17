# Neon operations runbook

This runbook covers the repository-side operational contract. It does not
claim that a Neon project, branch, credential, restore window, or external
approval exists.

## Connection roles

The application and worker receive only `DATABASE_URL`, which is the bounded,
TLS-required pooled Neon URL. Migrations, schema inspection, logical backups,
and restore validation receive only `DATABASE_DIRECT_URL`, which is the
bounded, TLS-required direct URL. The two URLs must be distinct; the pooler
hostname is never passed to administrative tooling.

`pnpm run migrate`, `pnpm run migrate:status`, and `pnpm run migrate:create`
are separately invoked administrative operations. Application startup does
not run migrations and Payload schema push remains disabled.

## One-time administrator bootstrap

After an empty database migration, an authorized operator runs:

```text
pnpm run bootstrap
```

The command reads the email and password interactively, refuses a non-empty
`users` collection, creates one `admin`, and prints neither credential. It
does not provide a default credential and no credential belongs in Git, a
fixture, a log, or an evidence record.

## Synthetic seed and reset

Only the committed `foundation` fixture is available. Local and CI runs may
use `pnpm run seed` and `pnpm run reset`. Development, staging, and production
are refused by default for both actions. A protected-environment run requires
all of the following, supplied out of band:

- `MMDC_BREAK_GLASS=I_UNDERSTAND_PROTECTED_SEED_RESET`;
- `MMDC_BREAK_GLASS_APPROVAL_FILE` containing a time-bounded approval with an
  approval ID, named approver, matching environment/action, and expiry.

The approval file contains no credential. Security owns the two-person
break-glass decision; the command does not create or infer that decision.

## Compatibility evaluation

Run the deterministic contract matrix with:

```text
pnpm run test:neon
```

The matrix covers jobs, the current foundation's version/draft transaction
scope, transactions and rollback, locking, suspend/wake retry behavior,
bounded timeouts, retries, and the Singapore latency budget. A live Neon probe
may be run only against an approved isolated environment and must retain the
Git SHA, environment, approver, timings, and sanitized result. No live probe
is claimed by this ticket.

If a live probe proves a Payload operation incompatible with transaction
pooling, that process must switch to a bounded direct connection and the
operator must add an ADR naming the operation, reason, scope, owner, and
rollback. Until that proof exists, no exception is configured.
