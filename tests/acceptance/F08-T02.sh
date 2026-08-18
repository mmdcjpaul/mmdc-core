#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0

fail() {
  printf 'F08-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm rg mktemp; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[ "$errors" -eq 0 ] || exit 1

# Reuse the project's pinned runtime and formatting policy. This check is
# local-only and does not create AWS resources or contact a provider.
run_check 'runtime policy' pnpm run check:runtime
run_check 'repository policy' pnpm run check:policy
run_check 'repository format check' pnpm run format:check
run_check 'host shell syntax' bash -n infrastructure/host/bootstrap.sh infrastructure/host/mmdc-pull-agent.sh infrastructure/host/mmdc-neon-backup.sh
run_check 'bootstrap isolation, idempotency, boundaries, and guarded evidence probe' node tests/acceptance/F08-T02-probe.mjs

# This ticket is guarded. There is intentionally no AWS CLI invocation here:
# the acceptance script must never create/execute a change set or manufacture
# provider evidence. The probe accepts only authentic, sanitized,
# digest-bound approval/recreation evidence already recorded by an operator.

if [ "$errors" -ne 0 ]; then
  printf 'F08-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F08-T02 acceptance: repository bootstrap checks and guarded external approval/recreation gate passed\n'
