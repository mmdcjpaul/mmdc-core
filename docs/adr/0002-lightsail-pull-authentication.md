---
status: Proposed
decision: Lightsail pull deployment uses a scoped host credential
owners:
  - Engineering and Product (role-level owner named by MMDC-WEB-PLAN-001)
approval_state: Blocked
approver: Not recorded
approved_at: Not recorded
---

# ADR-0002 — Lightsail pull deployment and host AWS authentication

## Context

The target architecture uses a Lightsail host that pulls an immutable image and
deployment state. CI publishes desired state; it does not receive inbound SSH
access to the host. Lightsail does not provide an instance-profile contract that
can be assumed here without an approved environment design, so the credential
shape and bootstrap channel must be explicitly reviewed before host work.

## Decision

### Owner

Engineering and Product own the decision at the role level, as named by
MMDC-WEB-PLAN-001. A named accountable approver has not been supplied in the
repository.

### Rationale

The proposed least-privilege design is a dedicated non-human host principal
whose credential is delivered through an approved bootstrap/secret channel and
used only by the pull agent. The agent reads the development deployment-state
object and pulls the exact ECR image digest. It does not receive broad account
permissions, source credentials, runtime secrets, or SSH access from CI.

The proposal is intentionally not marked accepted: the authentication mechanism,
AWS account, host, and bootstrap channel remain Phase 0 decisions.

### Alternatives considered

- Long-lived administrator or account-root credentials were rejected because
  they violate least privilege and make rotation and blast-radius control poor.
- GitHub Actions inbound SSH was rejected because CI must publish desired state
  and the host must pull it; the host is not exposed as a CI-controlled SSH
  target.
- A broad instance credential was rejected because the host needs only bounded
  deployment-state and ECR permissions.
- Unauthenticated or public ECR/deployment-state access was rejected because
  images and deployment metadata are private project assets.

### Consequences

The proposed granted AWS actions are limited to:

- ECR: `ecr:GetAuthorizationToken` against the required registry plus
  `ecr:BatchCheckLayerAvailability`, `ecr:BatchGetImage`, and
  `ecr:GetDownloadUrlForLayer` for the development repository.
- Deployment state: `s3:GetObject` for the exact development desired-state
  prefix and, only if status reporting is retained, `s3:PutObject` for the
  bounded development status prefix. No bucket-wide listing or unrelated
  environment access is granted.

Credential and bootstrap handling:

- No credential value belongs in Git, the image, CloudFormation output, user
  data, logs, or the deployment-state object.
- Bootstrap obtains the credential only through the approved secret channel,
  writes it to a root-readable protected runtime location, and records no
  secret value in output.
- The pull agent runs with the narrowest local permissions needed to read that
  protected credential and does not expose it to application or worker
  processes.

Rotation and revocation:

- The accountable AWS/security owner must define the rotation interval and
  exposure-response procedure before acceptance.
- Rotation replaces the credential through the approved channel, verifies a
  pull with the replacement, revokes the old credential, and retains sanitized
  evidence. A suspected exposure triggers immediate revocation and re-bootstrap.

### Approval state

Blocked pending accountable human confirmation of the host authentication
mechanism, AWS account, bootstrap/secret channel, exact repository and object
paths, rotation interval, and deployment-state write requirement. No credential,
account, hostname, region, authentication approval, or cloud access is claimed.

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
Acceptance also requires an authentic approval record with a named approver and
timestamp; this record intentionally does not provide one.
