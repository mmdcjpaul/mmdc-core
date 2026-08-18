#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0

fail() {
  printf 'F09-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm rg mktemp bash sha256sum jq; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
for file in infrastructure/host/mmdc-pull-agent.sh tests/acceptance/F09-T02-probe.mjs; do
  [ -f "$file" ] || fail "missing F09-T02 artifact: $file"
done
[ -x infrastructure/host/mmdc-pull-agent.sh ] || fail 'pull agent must be executable'
[ -x tests/acceptance/F09-T02.sh ] || fail 'acceptance script must be executable'
[ "$errors" -eq 0 ] || exit 1

# F09-T02 is a repository-only production-like simulation. It does not invoke
# AWS, SSH, ECR/S3, Neon, CloudFormation, or a live Lightsail host.
run_check 'runtime policy' pnpm run check:runtime
run_check 'repository policy' pnpm run check:policy
run_check 'F09-T02 shell syntax' bash -n infrastructure/host/mmdc-pull-agent.sh infrastructure/host/bootstrap.sh
run_check 'F09-T02 probe' node tests/acceptance/F09-T02-probe.mjs

if rg -n 'aws\s+(?:s3|ecr|cloudformation|lightsail)|ssh\s+|scp\s+|docker\s+push|git\s+push' \
  tests/acceptance/F09-T02.sh tests/acceptance/F09-T02-probe.mjs; then
  fail 'F09-T02 acceptance harness contains an external mutation or SSH command'
fi
if rg -n 'DATABASE_URL[^\n]*migrate|migrate:apply[^\n]*DATABASE_URL' infrastructure/host/mmdc-pull-agent.sh infrastructure/compose/production.yml; then
  fail 'shared-environment migration is not bound to DATABASE_DIRECT_URL'
fi
if rg -n "command:\s*\[[^]]*migrat|migrat(e|ion).*startup" infrastructure/compose/production.yml; then
  fail 'application replicas must not migrate at startup'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F09-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F09-T02 acceptance: deterministic pull-deployment transaction, one-shot direct migration, exact-digest recreation, rejection/idempotency/concurrency, recovery gates, rollback, safe-state, and sanitized status checks passed without external mutation\n'
