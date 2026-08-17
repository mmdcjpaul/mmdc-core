---
status: Accepted
decision: Lightsail pull deployment reuses the proven MMDC v3 scoped-host-credential pattern
owners:
  - Engineering and Product (role-level owner named by MMDC-WEB-PLAN-001)
approval_state: Accepted
approver: Jan Paul Fernandez
approved_at: 2026-08-17T08:16:31Z
---

# ADR-0002 — Lightsail pull deployment and host AWS authentication

## Context

The target architecture uses a Lightsail host that pulls an immutable image and
deployment state. CI publishes desired state; it does not receive inbound SSH
access to the host. The existing `mmdc-v3` development environment already uses
a working scoped-IAM-user and protected-file bootstrap pattern. This decision
adopts that pattern for this implementation without copying an existing key or
secret value.

## Decision

### Owner

Engineering and Product own the decision at the role level, as named by
MMDC-WEB-PLAN-001. Jan Paul Fernandez is the accountable approver for this
development authentication decision.

### Rationale

Operators authenticate local AWS CLI operations with the named `mmdc` profile.
The profile is never copied to Lightsail. CloudFormation creates a dedicated
non-human development workload IAM user in the MMDC AWS account, following the
`mmdc-v3-development-storage` pattern. A bootstrap script invoked by an
authorized operator uses `--profile mmdc` to create one access key and streams
it over the restricted operator SSH path directly into
`/opt/mmdc/secrets/aws.env` as `root:docker` mode `0640`. The value is never
written to Git, a local project file, CloudFormation output, user data, or a
deployment-state object.

The same host credential is available only to the processes that need the
approved development AWS workload operations. For deployment, the pull agent
reads `desired.json`, pulls the immutable digest from the single development ECR
repository, and publishes health results under `status/COMMIT_SHA.json`. GitHub
continues to publish through OIDC and receives neither this host credential nor
inbound SSH access.

### Alternatives considered

- Long-lived administrator or account-root credentials were rejected because
  they violate least privilege and make rotation and blast-radius control poor.
- GitHub Actions inbound SSH was rejected because CI must publish desired state
  and the host must pull it; the host is not exposed as a CI-controlled SSH
  target.
- Copying the operator's local `mmdc` profile to the host was rejected because
  that profile is for authorized administration and is broader than the host
  workload boundary.
- A broad instance credential was rejected because the host needs only bounded
  deployment-state, ECR, and separately reviewed application-storage
  permissions.
- Unauthenticated or public ECR/deployment-state access was rejected because
  images and deployment metadata are private project assets.

### Consequences

The proposed granted AWS actions are limited to:

- ECR: `ecr:GetAuthorizationToken` against the required registry plus
  `ecr:BatchCheckLayerAvailability`, `ecr:BatchGetImage`, and
  `ecr:GetDownloadUrlForLayer` for the single development repository. The
  desired image must match that repository URI and an immutable `sha256` digest.
- Deployment state: `s3:GetObject` for the exact development object
  `desired.json` and `s3:PutObject` for `status/COMMIT_SHA.json`. Status reporting
  is retained so CI can wait for the host health result. No bucket-wide listing,
  desired-state write, or unrelated environment access is granted.
- In policy terms, `desired.json` is the exact development desired-state prefix,
  and `status/*` is the only development status prefix the host may write.

Credential and bootstrap handling:

- No credential value belongs in Git, the image, CloudFormation output, user
  data, logs, or the deployment-state object.
- Bootstrap creates at most one key, streams it directly from an approved
  `--profile mmdc` CLI session over the restricted operator SSH path, writes it
  to `/opt/mmdc/secrets/aws.env` as `root:docker` mode `0640`, and records no
  secret value in output. If transfer fails, the newly created key is deleted.
- This SSH stream is the approved bootstrap/secret channel, and
  `/opt/mmdc/secrets/aws.env` is the root-readable protected runtime location.
- As in the reference setup, the credential may also be injected into an
  application process that needs the separately reviewed private-media S3
  permissions. It is not exposed to a browser, public response, image, source
  tree, or process that has no approved AWS workload operation.

Rotation and revocation:

- Rotation is explicit and operator-driven because Lightsail has no assumed
  workload-role contract in this design. The operator creates a replacement key
  through `--profile mmdc`, transfers it through the same protected channel,
  verifies desired-state read, ECR pull, and status write, then revokes the old
  key. A suspected exposure triggers immediate revocation and re-bootstrap.
- The credential inventory established by F00-T02 owns the rotation interval and
  exposure-response procedure, plus last-rotated evidence; the infrastructure
  must also alert or fail validation when that interval is exceeded.
- The rotation procedure verifies the replacement first, revokes the old credential,
  and retains sanitized evidence.

### Approval state

Accepted by Jan Paul Fernandez at 2026-08-17T08:16:31Z: reuse the existing
`mmdc-v3` development host-authentication mechanism, bootstrap channel,
deployment-state read and status-write behavior, and ECR pull boundary. No
credential value or cloud mutation is authorized or claimed by this record.
No AWS account access, hostname allocation, region change, secret value, or
existing cloud resource is claimed.

## Implementation boundaries

This ADR authorizes no IAM user, role, access key, bucket, ECR repository,
Lightsail host, bootstrap, or deployment-agent mutation. It does not authorize
testing against AWS. Those actions require an accepted ADR, an approved exact
change set where applicable, and the identity/approval gates in the repository
instructions.

## Verification

Acceptance must verify that the granted action list is narrow and path-scoped,
that credential/bootstrap and rotation handling are explicit, that rejected
alternatives are recorded, and that no secret or cloud evidence is fabricated.
The approval record must retain the named approver and timestamp above.
