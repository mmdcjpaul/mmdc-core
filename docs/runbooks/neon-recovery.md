# Neon recovery runbook

Recovery is an operator-controlled procedure. The restore owner is the Neon
owner; the cutover owner is Engineering. A Neon restore approver and the
Engineering lead must approve a cutover. This repository does not claim that
those approvals, a restore window, or a Neon environment are currently
available.

## Before a material migration

1. Confirm the environment's approved restore window. A provider default is
   not sufficient.
2. Record the migration, compatibility declaration, owner, and approver.
3. Create a pre-migration Neon restore point/snapshot when the approved plan
   supports it.
4. Create a logical backup with `DATABASE_DIRECT_URL` using
   `node scripts/neon-recovery.mjs backup`. The pooled URL is never passed to
   `pg_dump`.
5. Record the sanitized backup location, migration ID, environment, approver,
   expiry/retention date, and result.

## Isolated restore and validation

1. Create or select a temporary branch/environment with an explicit expiry.
2. Set `NEON_RECOVERY_TEMPORARY_URL` to its direct URL and
   `NEON_RECOVERY_LIVE_URL` to the live direct URL. The tool rejects equal
   endpoints and pooler endpoints.
3. Restore into the temporary target with `node scripts/neon-recovery.mjs
   restore` only after the approved recovery record is present.
4. Validate migration history, users, media metadata, constraints, counts,
   authentication behavior, and application health there. Do not mutate the
   live branch during validation.
5. Retain sanitized command result, timings, Git SHA, migration version,
   temporary environment, named approver, and validation owner.

## Cutover and cleanup

Cutover is a separate approved procedure owned by Engineering and approved by
the Neon restore approver and Engineering lead. It must state whether the
previous application image is schema-compatible, the maintenance/read-only
window, connection secret rotation, verification probes, abort condition, and
rollback target. A restore test is never itself permission to cut over.

After validation or an aborted rehearsal, delete the temporary branch only
after its evidence is retained. Apply the approved retention policy to logical
backups, provider restore points, CI branches, developer branches, and
temporary recovery branches; do not leave recovery branches indefinite.

External recovery evidence must name its approver and environment. If those
fields or the approved cutover procedure are absent, the operator must stop
and report a blocker rather than fabricate a rehearsal or approval.
