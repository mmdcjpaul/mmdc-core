#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0

fail() {
  printf 'F07-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm ruby rg git; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[ "$errors" -eq 0 ] || exit 1

# The local harness parses the workflow, resolves every stable job to its
# repository command, and executes each mandated negative path. Docker is
# intentionally not required here: the production-like container job is
# executed by GitHub runners and the existing F06-T02 smoke remains its
# executable source of truth.
run_check 'workflow lint, job simulation, and injected failure propagation' \
  node scripts/ci-workflow-harness.mjs all

# Run the same host-independent quality commands used by the policy, install,
# typecheck, and unit-schema jobs. No hosted database or developer environment
# file is supplied to any of these commands.
run_check 'runtime policy' pnpm run check:runtime
run_check 'repository policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'lint' pnpm run lint
run_check 'frozen install' pnpm install --frozen-lockfile
run_check 'unit and schema tests' pnpm run test
run_check 'generated type freshness and TypeScript' pnpm run ci:typecheck
run_check 'credential-free production build' env -u PAYLOAD_SECRET -u DATABASE_URL -u DATABASE_DIRECT_URL \
  -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u NEON_API_KEY -u NEON_DATABASE_URL \
  pnpm run ci:build

if [ "$errors" -ne 0 ]; then
  printf 'F07-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F07-T01 acceptance: workflow lint, all stable job simulations, quality commands, generated-file proof, credential-free build, and every injected blocking failure passed\n'
