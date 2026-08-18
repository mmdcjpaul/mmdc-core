#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0

fail() {
  printf 'F09-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm rg ruby git; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[ -x tests/acceptance/F09-T01.sh ] || fail 'acceptance script must be executable'
[ "$errors" -eq 0 ] || exit 1

# All checks below are deterministic and local. In particular, this ticket's
# acceptance does not invoke AWS, push a tag, publish to ECR, write S3 state,
# deploy a host, or open an SSH connection.
run_check 'runtime policy' pnpm run check:runtime
run_check 'repository policy' pnpm run check:policy
run_check 'repository formatting' pnpm run format:check
run_check 'release workflow YAML parse' ruby -e 'require "yaml"; YAML.load_file(ARGV.fetch(0))' .github/workflows/release.yml
run_check 'release publication semantic/ref/ancestry/integrity probe' node tests/acceptance/F09-T01-probe.mjs

if rg -n "(?:execFileSync|spawnSync)\([^\n]*['\"]aws|execFileSync\(['\"]aws|spawnSync\(['\"]aws" \
  tests/acceptance/F09-T01.sh tests/acceptance/F09-T01-probe.mjs; then
  fail 'acceptance harness contains an external AWS invocation'
fi
if rg -n 'git push|docker push|scp |ssh -' tests/acceptance/F09-T01-probe.mjs; then
  fail 'acceptance harness contains an external release/deployment mutation'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F09-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F09-T01 acceptance: semantic release gates, immutable SHA publication contract, evidence binding, desired-state integrity/replay controls, OIDC/IAM policy, and local publication dry-run passed without external mutation\n'
