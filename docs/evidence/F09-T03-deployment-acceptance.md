# F09-T03 deployment acceptance evidence

| Field              | Value                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence state     | **Blocked — authentic external release evidence not supplied**                                                                                                                                     |
| Local verifier     | Passed deterministic synthetic reconciliation and negative-path proof                                                                                                                              |
| External verifier  | Not run against a retained authentic release record                                                                                                                                                |
| Environment        | development; no F09-T03 runtime release is claimed                                                                                                                                                 |
| Required release   | An explicitly approved `vMAJOR.MINOR.PATCH-dev.N` development tag with runtime secret channel                                                                                                      |
| Required evidence  | Repository/ref/workflow, Git SHA, ECR digest, desired-state digest/integrity, migration version, web/worker digests, probes, final status, approvals, timestamps, and retained artifact references |
| Synthetic evidence | Clearly labeled in `tests/acceptance/F09-T03-probe.mjs`; never promoted to acceptance                                                                                                              |
| External mutation  | None — no tag, GitHub workflow, ECR/S3 publication, SSH, Lightsail deployment, Neon mutation, or AWS mutation was performed                                                                        |

## Precise blocker and input checklist

F09-T03 cannot be marked Done until an authorized operator supplies all of the
following through the approved external channel:

1. Explicit approval for one exact development semantic tag/release and its
   workflow run, with the required development runtime secret channel available.
2. Retained GitHub workflow evidence naming repository, exact ref, run ID,
   actor, commit SHA, and protected-environment approval.
3. Retained ECR evidence naming the Git-SHA tag and exact immutable digest,
   plus SBOM/provenance references and hashes.
4. The exact F09-T01 desired-state object and its canonical integrity and
   artifact digests.
5. Sanitized Neon recovery/migration evidence naming migration version and
   outcome; no connection strings or secret values.
6. Sanitized host status naming exact web/worker digests, required probe
   results, final status, UTC timestamps, correlation ID, and retained status
   reference.
7. Provider/host evidence references and named approver records sufficient to
   prove the result is authentic rather than synthetic.

Validate the assembled record with the runbook command in
`docs/runbooks/deployment-acceptance.md`. A missing record, substituted
identifier, synthetic marker, unbounded log/status, secret-shaped value, or
missing stage must remain a failing gate.
