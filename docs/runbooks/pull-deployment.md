# Pull deployment runbook

F09-T02 owns the host-side transaction after F09-T01 publishes an
integrity-checked desired-state document. The host does not accept a branch
push, mutable image tag, SSH deployment, or application-source build.

## Transaction

`/usr/local/libexec/mmdc-pull-agent --reconcile <desired-state.json>` runs under
an atomic host lock. It verifies the environment, semantic release order,
Git-SHA image reference, immutable `sha256:` digest, migration contract,
workflow identity, evidence hashes, and canonical state hash before it reads or
changes runtime state. A duplicate is successful and idempotent; an older,
tampered, conflicting, wrong-environment, or mutable state is rejected.

The agent captures the active digest from the last successful
`/var/lib/mmdc/deployment/current.json`, then runs configured Neon, S3, and
Meilisearch readiness probes. Before pulling the target image, an external
operator/provider step must create sanitized JSON evidence containing a Neon
restore point ID and logical-backup path for the target migration. The agent
rejects missing, mismatched, or secret-shaped evidence.

The only migration invocation is an ephemeral container from the target
`repository@sha256:digest` with `DATABASE_DIRECT_URL` supplied through the
protected runtime environment:

```text
docker run --rm --env-file /etc/mmdc/runtime.env --entrypoint pnpm \
  repository@sha256:digest run migrate:apply
```

Before that container starts, the agent atomically creates
`/var/lib/mmdc/deployment/migration-<git-sha>.state.json` with status
`attempted`. A successful task changes the marker to `succeeded`; a failed
task changes it to `failed`. Any existing `attempted`, `failed`, `succeeded`,
or invalid marker blocks automatic migration re-execution. A failed redelivery
therefore remains `migration-failed` with
`migration-attempt-already-recorded`; a task that succeeded before a process
crash remains in `safe-state` until its service cutover is explicitly
reconciled. The marker rename is atomic and is protected by the same host
deployment lock as the rest of the transaction.

The production Compose application and worker commands are `web` and `worker`;
they do not migrate during startup. After migration, the agent recreates both
services with the same exact digest and `--no-deps`, so the persistent
Meilisearch volume is not removed or recreated.

The required post-deploy probes cover health/readiness, the synthetic public
route, Payload Admin, database, search, and media. A passing transaction writes
one bounded sanitized status object under `status/<git-sha>.json`. A compatible
health failure recreates both services at the prior digest and verifies the
same probes. An incompatible-schema failure never performs image-only rollback;
it stops the application/worker into the explicit `safe-state` and requires
the migration-specific forward-fix or Neon restore procedure.

## Least-privilege host configuration

The agent needs only read access to the configured desired-state object and the
exact ECR image, plus write access to the per-commit status prefix if status is
published remotely. Status publication is configured as a root-owned command
in `/etc/mmdc/pull-agent.env`; it receives only `MMDC_STATUS_FILE`. It must not
print credentials or provider responses. The runtime and agent environment
files remain mode `0600`.

The F08 bootstrap remains readiness-compatible: `--check` validates the
protected files, private Compose definitions, Docker/Compose, and the absence
of startup migrations. Deployment transitions occur only when the guarded
`--reconcile` mode receives an approved F09-T01 state.

## Local proof

The deterministic acceptance harness uses no AWS, GitHub, ECR, S3, Neon,
Lightsail, SSH, real URL, or secret. It uses fixture readiness markers and
command shims to exercise duplicate, stale, tampered, wrong-environment,
mutable, migration-failure, health-failure, compatible-rollback,
incompatible-schema, recovery-evidence, concurrent-delivery, and repeated
failed-migration-delivery paths:

```text
./validation.sh F09-T02
```
