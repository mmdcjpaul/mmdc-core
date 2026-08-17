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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
