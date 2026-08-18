# F09-T01 release publication evidence

| Field | Value |
| --- | --- |
| Evidence state | Local publication dry-run passed |
| Environment | development (synthetic harness only) |
| Semantic tag | `v1.2.3-dev.4` |
| Git SHA | `0123456789abcdef0123456789abcdef01234567` |
| ECR image reference | `dry-run.invalid/mmdc-v3-development:0123456789abcdef0123456789abcdef01234567` |
| ECR digest | `sha256:52a22c7d1bcd2eabc2dd3da2b56300be9d0604aa3d902f94670f97861f23412f` (synthetic) |
| Desired-state integrity | `ed280ed6fdbb16ed5776793ad6a13c621806d1eeca2f725e214865df8534bc78` over canonical unsigned state |
| Evidence binding | SBOM `953cb78189811980dde73f66c2c3eb40121f771364dd791106ca64e401cdc22b`; provenance `7055f07fc08cd0e726b1449b5a4f2be2a52288dbc66463b88477b884ede35b9e`; publication `dcc220907eb8dc9dfd8985fe3191eadce7b864d995378a03db8a67786a00cf28` |
| Negative paths | malformed/moved/unreachable/reused tag, branch push, wrong environment, mutable reference, tampering, replay, and untrusted event |
| External mutation | None — no GitHub, AWS, ECR, S3, host, deployment, tag push, or SSH operation |

This is intentionally dry-run evidence, not a claim that an image was
published or a deployment occurred. The executable proof is
`tests/acceptance/F09-T01.sh`; it creates temporary Git repositories and uses
synthetic files only. The real workflow is `.github/workflows/release.yml` and
requires the external protected-environment and repository approvals recorded
by the project policy before a provider release is authorized.
