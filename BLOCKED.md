# Resolved blocked-ticket history

F08-T02 was previously blocked while exact change-set approval and host
recreation evidence were missing. That historical gate was later resolved
after the approved additive Lightsail change set executed successfully and the
host bootstrap/recreation evidence was reconciled. The unavailable client
approval timestamp remains represented only as a truthful ordering attestation
and is not inferred.

## F08-T02 — resolved history

The original fail-closed attempt required an authentic `mmdc-iaac` identity,
exact approved change-set evidence, and sanitized host recreation evidence.
It did not execute a change set or fabricate provider results. The retained
F08-T02 evidence is in `docs/evidence/F08-T02-host-bootstrap.md`.

# Active blocked-ticket record

## F09-T03 — 2026-08-18

**Ticket:** Prove deployment rejection, idempotency, audit, and recovery paths

**Status:** Blocked after all repository-local proof was implemented.

**Reason:** No newly approved development tag/release, runtime secret channel,
or authentic retained GitHub/ECR/Neon/Lightsail deployment evidence is present.
The deterministic synthetic harness is intentionally insufficient for Done.

**Local proof:** `node tests/acceptance/F09-T03-probe.mjs` passes all positive
reconciliation and required negative paths. The full
`tests/acceptance/F09-T03.sh` remains fail-closed until an authorized operator
provides the exact evidence record.

**Required next input:** Follow the exact checklist in
`docs/evidence/F09-T03-deployment-acceptance.md`. Do not create or push a tag,
trigger GitHub, publish ECR/S3, SSH, deploy to Lightsail, mutate Neon/AWS, or
invent provider/host evidence without that approval and secret channel.

F10-T01 was not started.
