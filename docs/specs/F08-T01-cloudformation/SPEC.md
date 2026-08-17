---
id: F08-T01
feature: F08 AWS infrastructure
title: Define tagged development infrastructure in CloudFormation
autonomy: guarded
---

# Define development AWS infrastructure

## Intent

Express recreatable AWS development resources and least privilege in version-controlled CloudFormation.

## Requirements

- **F08-T01-R01 — Ubiquitous:** CloudFormation SHALL define approved development ECR, private media and deployment-state S3 buckets, GitHub OIDC role, Lightsail instance/static IP, approved DNS/CloudFront resources, alarms, and retention policies.
- **F08-T01-R02 — Ubiquitous:** Managed resources SHALL carry `Project=mmdc-v3`, `Environment=development`, `ManagedBy=cloudformation`, and the approved `Owner` tag wherever AWS supports those tags.
- **F08-T01-R03 — Ubiquitous:** IAM policies SHALL constrain repository, workflow, allowed tag refs, ECR actions, deployment-state object paths, media paths, and environment boundaries to least privilege.
- **F08-T01-R04 — Prohibition:** CloudFormation parameters, outputs, metadata, user data, and stack events SHALL NOT contain Neon credentials or other runtime secret values.
- **F08-T01-R05 — Prohibition:** CloudFormation SHALL NOT claim ownership of Neon projects, branches, roles, restore windows, or API credentials.
- **F08-T01-R06 — Event-driven:** WHEN templates are evaluated, validation SHALL reject public media/deployment buckets, unapproved public ports, wildcard privileges, missing retention, missing tags, or a region other than approved `ap-southeast-1`.

## Acceptance criteria

- Template validation, lint, policy-as-code, secret scan, and cost estimate pass.
- Deletion/retention behavior matches the approved register.
- No production or Neon resource is accidentally modeled.
- IAM tests prove representative allow and deny cases.

## Validation

`tests/acceptance/F08-T01.sh` shall run CloudFormation validation/lint, policy-as-code, IAM assertions, tag/retention/region checks, secret scans, and cost-output checks without creating resources. Run `./validation.sh F08-T01`.

## Dependencies

F07-T02 and F05-T02.

## Traces

Implementation Plan Phase 8, target architecture, secrets plan, risks, and AWS decisions.
