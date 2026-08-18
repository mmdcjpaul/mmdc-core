# Development release publication runbook

F09-T01 owns the publication boundary from an approved development semantic tag
to one immutable ECR digest and one integrity-checked desired-state document.
It does not deploy a host, run migrations, or replace the pull agent; those
transitions belong to F09-T02.

## Release contract

Only a `push` event for `vMAJOR.MINOR.PATCH-dev.N` may enter the publication
job. The tag must resolve to the event Git SHA, that commit must be reachable
from `development`, the tag must not be force-updated or reused for another
SHA, and the protected `development` environment must authorize the job.
Branch pushes, pull requests, malformed tags, wrong environments, untrusted
events, and unreachable commits publish no image or desired state.

The workflow builds once with the Git SHA tag and BuildKit SBOM/provenance
attestations. It resolves the ECR `sha256:` digest and maps the semantic tag to
that digest without rebuilding. The desired state contains the environment,
semantic tag, Git SHA, Git-SHA image tag, digest, migration version/command,
workflow identity, evidence hashes, and a monotonic release order. Its
canonical JSON hash covers every field except the integrity envelope.

Neither the workflow nor the host uses a mutable image reference. GitHub uses
the constrained OIDC role for the publication job; no long-lived AWS key,
inbound CI SSH, or protected credential is supplied to branch or fork events.

## Local dry-run

The deterministic harness exercises the complete mapping without AWS, GitHub,
ECR, S3, tag pushes, deployment, or SSH:

```bash
node scripts/release-publication.mjs dry-run \
  --output .artifacts/f09-t01/desired.json \
  --sbom-output .artifacts/f09-t01/sbom.json \
  --provenance-output .artifacts/f09-t01/provenance.json
./validation.sh F09-T01
```

The dry-run values are explicitly synthetic. They prove schema, SHA-to-digest,
SBOM/provenance hash binding, tamper detection, monotonic replay rejection, and
idempotent duplicate handling; they are not provider or deployment evidence.

## Operator evidence rule

The publication artifact is retained by the workflow for 14 days and must be
correlated by run ID. A real release record must retain the exact Git ref/SHA,
ECR digest, SBOM/provenance artifact hashes, desired-state hash, workflow
identity, environment, migration version, and final host status. F09-T01's
acceptance deliberately records only the local dry-run evidence below.
