# Development host bootstrap and change-set runbook

This runbook is the operator contract for F08-T02. The repository provides the
bootstrap definition; it does not provide an AWS account, credentials, a
hostname, a Neon secret, or approval to provision. The host runs the immutable
application image and never builds application source.

## Before proposing an infrastructure change

1. Confirm the intended MMDC account and caller with the named AWS profile. Do
   not use the AWS `default` profile:

   ```bash
   aws sts get-caller-identity --profile mmdc-iaac
   ```

   Stop unless the account is `349762920349` and the caller is an
   `arn:aws:sts::349762920349:assumed-role/MMDCIaacOperator/...` session. The
   identity check is evidence, not authorization.

2. Compute and retain the exact template digest without including credentials:

   ```bash
   sha256sum infrastructure/cloudformation/development.json
   ```

3. Validate and lint the exact template in the approved region:

   ```bash
   aws cloudformation validate-template \
     --template-body file://infrastructure/cloudformation/development.json \
     --region ap-southeast-1 \
     --profile mmdc-iaac
   cfn-lint --region ap-southeast-1 infrastructure/cloudformation/development.json
   ```

4. Create a named change set for the exact template and approved parameter
   values, passing
   `arn:aws:iam::349762920349:role/MMDCDevelopmentCloudFormationExecution` as
   the CloudFormation execution role. Use a unique change-set name and retain
   its ARN; never put a secret in a parameter, tag, description, output, or
   shell history.

5. Inspect the change set before any execution:

   ```bash
   aws cloudformation describe-change-set \
     --stack-name <approved-stack-name> \
     --change-set-name <exact-change-set-name-or-arn> \
     --region ap-southeast-1 \
     --profile mmdc-iaac
   aws cloudformation list-stack-resources \
     --stack-name <approved-stack-name> \
     --region ap-southeast-1 \
     --profile mmdc-iaac
   ```

   Review the region, names, Lightsail bundle and availability zone, public
   ports, IAM principals/actions/resources/conditions, cost estimate,
   deletion/update-replace policies, and required tags. Compare every value to
   the approved registers and the exact template digest.

6. Obtain explicit approval for that exact change-set ARN/digest from the
   roles in `docs/registers/ownership-approval-matrix.md`. Record the identity,
   digest, cost, approver, ISO timestamp, change-set identifier, and sanitized
   non-secret outputs in `docs/evidence/F08-T02-host-bootstrap.md`. A plan,
   template, or authorship is not approval.

The autonomous loop and this repository's acceptance test never execute a
change set. An operator must use the separately governed execution gate only
after the approval record is complete. If the identity, authority, exact
change set, or approval is missing, stop and leave the ticket blocked.

## Recreate a development host

After the approved CloudFormation change has created the host, transfer the
reviewed repository bootstrap artifact through the approved administrative
channel and run it as root. The transfer channel is external and must not put
credentials in the repository or CloudFormation user data.

```bash
MMDC_BOOTSTRAP_SOURCE_ROOT=/srv/mmdc-reviewed \
  /srv/mmdc-reviewed/infrastructure/host/bootstrap.sh
```

The script is safe to repeat. It installs Docker Engine/Compose, provisions the
Caddy/Compose definitions, installs the readiness-configured pull agent and
the `pg_dump`-based direct-Neon backup wrapper, creates root-only environment
files, enables log rotation, and enables the agent service. Runtime values are
delivered separately into `/etc/mmdc/*.env` with mode `0600`; the bootstrap
never prints them. It does not invoke `pnpm`, `npm`, `git`, a compiler, or a
source build.

For F08-T02, deployment-ready means Phase 8 readiness-ready: the reviewed
bootstrap has completed, the protected environment-file locations and private
service boundaries are present, and the pull agent is enabled and passes its
readiness check. This is the state from which the host can receive a later
approved Phase 9 release. Runtime secret values, an immutable application image
digest, desired state, deployment transitions, and release health evidence are
owned by Phase 9 and are not F08-T02 preconditions. F08-T02 must not invent
those values or claim that a release has been deployed.

## Evidence rules

Evidence must be sanitized and digest-bound. It may contain account/caller
identifiers, resource names, version strings, timestamps, change-set IDs,
cost estimates, and non-secret outputs. It must not contain access keys, Neon
URLs or passwords, application secrets, tokens, private keys, complete env
files, or raw stack events that expose a secret. The acceptance script rejects
an approval/recreation record with placeholders, a stale template digest,
missing fields, or secret-shaped values.
