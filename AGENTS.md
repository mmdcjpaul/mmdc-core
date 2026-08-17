# Repository agent instructions

## AWS CLI

- Every AWS CLI invocation for this repository must use the named `mmdc` profile.
- Prefer an explicit `--profile mmdc` argument, for example:

  ```bash
  aws sts get-caller-identity --profile mmdc
  aws cloudformation validate-template --template-body file://template.yaml --profile mmdc
  ```

- A repository script may instead set `AWS_PROFILE=mmdc` within that script's scoped environment when every AWS command in the script inherits it.
- Do not use, modify, or rely on the AWS `default` profile.
- Before any approved AWS operation, verify the active identity with `aws sts get-caller-identity --profile mmdc` and confirm that the account and caller match the intended MMDC environment.
- Identity verification does not authorize a cloud mutation. Continue to follow the approval and change-set gates in `IMPLEMENTATION_PLAN.md` and the applicable ticket specification.
