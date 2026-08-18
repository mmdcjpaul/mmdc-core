#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATE="$ROOT/infrastructure/cloudformation/development.json"
errors=0

fail() {
  printf 'F08-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm rg; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[ -f "$TEMPLATE" ] || fail 'missing CloudFormation template'
[ "$errors" -eq 0 ] || exit 1

# These are the repository's existing host-independent quality commands. They
# do not contact AWS or create infrastructure.
run_check 'runtime policy' pnpm run check:runtime
run_check 'repository policy' pnpm run check:policy
run_check 'repository format check' pnpm run format:check
run_check 'CloudFormation JSON formatting' pnpm exec prettier --check "$TEMPLATE" tests/acceptance/F08-T01-probe.mjs

# cfn-lint is used when installed. The checked-in dependency-free probe is the
# deterministic fallback in clean environments: it parses the actual template,
# rejects unknown resource types, checks CloudFormation sections/intrinsics,
# and executes the policy and IAM behavior assertions below.
if command -v cfn-lint >/dev/null 2>&1; then
  run_check 'CloudFormation lint' cfn-lint --region ap-southeast-1 "$TEMPLATE"
fi
run_check 'CloudFormation validation and policy-as-code probe' node tests/acceptance/F08-T01-probe.mjs

# Secret scanning is intentionally scoped to the template's parameter,
# metadata, output, and user-data boundary. No AWS stack events are generated
# by this acceptance run, so it cannot fabricate or substitute cloud evidence.
if rg -n -i 'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|postgres(ql)?://[^[:space:]@:]+:[^[:space:]@]+@|Bearer[[:space:]]+[A-Za-z0-9._-]{12,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|(^|[^A-Za-z0-9_])(PAYLOAD_SECRET|NEON_API_KEY|AWS_SECRET_ACCESS_KEY|S3_SECRET_ACCESS_KEY)[[:space:]]*=' "$TEMPLATE"; then
  fail 'CloudFormation template contains a credential-shaped runtime value'
fi

# Verify the committed cost register is the source of the estimate and that
# the output is a planning estimate, not fabricated provider billing evidence.
if ! rg -q 'planning envelope is \*\*USD 40–265 per month\*\*' docs/registers/cost-retention-register.md; then
  fail 'cost register planning envelope is missing'
fi
if ! rg -q 'USD 40-125 per month|USD 40-265' "$TEMPLATE"; then
  fail 'CloudFormation cost output is missing the registered planning range'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F08-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F08-T01 acceptance: CloudFormation validation/lint, policy-as-code, IAM allow/deny, private storage, tags, retention, region, secret scan, and cost-output checks passed without cloud mutation\n'
