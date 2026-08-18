# Development deployment acceptance runbook

F09-T03 verifies the evidence boundary after F09-T01 publication and the
F09-T02 host transaction. The verifier reconciles one release from the source
tag through the immutable image, desired state, migration, running services,
probes, final status, approvals, and retained artifacts.

## Evidence contract

Supply one JSON record matching the schema in
`docs/evidence/F09-T03-deployment-acceptance.template.json` through the
authorized evidence-retention channel. The record must identify:

- the repository, exact tag ref, workflow run, Git SHA, and development environment;
- the ECR repository and immutable digest, Git-SHA image tag, desired-state
  artifact digest, and canonical desired-state integrity hash;
- the migration version and outcome, exact web/worker digests, all required
  probe outcomes, bounded final status, and correlation ID;
- named approver(s), UTC timestamps, and retained SBOM, provenance,
  desired-state, status, and provider artifact references.

Run the local verifier with:

```text
node scripts/deployment-evidence-verifier.mjs verify \
  --input /authorized/path/F09-T03-deployment-acceptance.json \
  --require-authentic
```

The verifier rejects substitutions, inconsistent tag/ref/workflow identity,
cross-release migration or service evidence, stale/duplicate/tampered state
claims, wrong environments, mutable image references, failed-stage omissions,
secret-shaped values, synthetic markers in authentic records, and unbounded
logs or status. Every log and status object must be release-identified and
correlated to the same run.

## Required local proof

`tests/acceptance/F09-T03-probe.mjs` is deterministic synthetic proof only. It
covers branch push, invalid tag/ref, wrong environment, duplicate and stale
state, tampered integrity, failed migration, compatible health rollback, and
incompatible safe state. It also proves bounded/sanitized logs and status and
that synthetic evidence cannot pass `--require-authentic`.

`tests/acceptance/F09-T03.sh` intentionally fails closed when the authorized
external JSON record is absent. Never create a Git tag, trigger GitHub, publish
ECR/S3, SSH to Lightsail, deploy, mutate Neon/AWS, or fill a provider result
with fixture values merely to make this gate pass.

## Completion gate

F09-T03 can move from `Blocked` to `Done` only after the exact approved
development release has been exercised with the required runtime secret
channel and the verifier accepts the authentic record. The retained evidence
must name the environment, approver, timestamps, immutable digests, migration
version, final status, and artifact references without exposing secrets or
complete request payloads.
