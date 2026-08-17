---
register: ownership-and-approval
version: 1.0
status: Active
accountable_owner: Engineering
last_reviewed: 2026-08-17
review_cadence: monthly and before every governed change
---

# Ownership and approval matrix

## Scope

This matrix assigns accountable roles and approval gates for project controls,
provider boundaries, data changes, deployment, recovery, and emergency access.
It does not name a person or imply that a guarded approval has occurred.

## Accountable owner

Engineering maintains the matrix. Product is accountable for product/data
decisions, while the named provider and control owners are accountable for
their operational domains.

## Records

| Subject | Accountable owner role | Required approver role | Evidence to retain | Decision state |
| --- | --- | --- | --- | --- |
| Engineering scope and implementation order | Engineering lead | Engineering and Product decision owners | Versioned plan and ticket acceptance | Blocked: this ticket does not create a new human approval record |
| Product scope, content, and data class | Product owner | Product owner plus Security when access classification changes | Approved change record | Blocked until a named product decision is recorded for each new data class |
| AWS account, region, CloudFormation, ECR, Lightsail, and AWS budgets | AWS owner | AWS change-set approver and Engineering deployment approver | Change set, sanitized outputs, and review record | Blocked: account, region, names, costs, and change set are not provided by this ticket |
| Neon project, branch, plan, roles, restore window, and Neon budgets | Neon owner | Neon owner plus Engineering migration approver | Sanitized Neon bootstrap/recovery record | Blocked: plan, restore window, and project allocation require explicit approval |
| DNS, CloudFront, origin hostname, and edge access | DNS owner | DNS owner plus Security owner | DNS/change record and edge verification | Blocked: final hostnames and edge choice require explicit approval |
| Security, secret handling, access review, and exposure response | Security owner | Security owner | Review record, scan result, and incident record | Blocked: repository controls are documented; provider-specific access review requires resources |
| Schema migrations and migration compatibility | Migration owner (Engineering) | Engineering migration approver; Neon owner for provider recovery | Migration review, compatibility declaration, and recovery note | Blocked for hosted execution until the Neon recovery point and change approval exist |
| Development and staging deployments | Deployment owner (Engineering) | Development deployment approver (Engineering); Staging deployment approver (Engineering and Product) | Protected-tag review, CI evidence, digest, and status | Blocked: protected environment reviewers are not configured in this repository |
| Production deployment | Deployment owner (Engineering) | Production deployment approver (Product, Engineering, and Security) | Protected environment approval and immutable digest evidence | Blocked: no production deployment is authorized by this ticket |
| Neon restore or database cutover | Restore owner (Neon) | Neon restore approver and Engineering lead | Isolated restore evidence and approved cutover record | Blocked: no restore rehearsal or cutover authority is present |
| S3 media recovery | AWS owner with Engineering | Security owner and Product owner for data exposure | Isolated recovery evidence and access review | Blocked: no bucket or recovery rehearsal evidence is present |
| Break-glass access | Security owner | Two-person approval: Security owner and the affected system owner | Time-bounded incident record, actions, and revocation evidence | Blocked: emergency access is unavailable until the two-person path is configured |
| Branch protection and semantic tag policy | Engineering repository owner | Engineering lead and Product decision owner | Protected-branch settings, tag rule, and required-check run | Blocked: external repository settings are not asserted by this document |

## Approval record rule

Each row is a control assignment, not an approval. A decision may be marked
`Approved` only when its retained evidence names the approver and an ISO date.
Otherwise it is explicitly `Blocked`, with no implied default or authority.

## Change and review

Engineering reviews the matrix monthly, after an incident, and before any
change affecting access, data, migration, deployment, restore, or break-glass
authority. Security reviews exposure-response and emergency-access rows at
the same cadence.
