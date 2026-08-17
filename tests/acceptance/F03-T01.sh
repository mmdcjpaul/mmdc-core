#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
compose_json=""

fail() {
  printf 'F03-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  [ -z "$compose_json" ] || rm -f "$compose_json"
}
trap cleanup EXIT

run_check() {
  local description="$1"
  shift
  if ! "$@"; then
    fail "$description failed"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

cd "$ROOT"
for command in node pnpm docker rg; do require_command "$command"; done

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint

compose_json="$(mktemp "${TMPDIR:-/tmp}/mmdc-f03-t01-compose.XXXXXX")"
if ! docker compose -f infrastructure/compose/local.yml --profile postgres config --format json >"$compose_json"; then
  fail 'rendered local Compose configuration failed'
fi
run_check 'local service and database-mode behavioral probe' env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN node --import tsx tests/acceptance/F03-T01-probe.mjs "$compose_json"

default_services="$(env -u MMDC_DATABASE_MODE MMDC_ENVIRONMENT=local DATABASE_URL='postgresql://mmdc@127.0.0.1:5432/mmdc_local' node scripts/local-services.mjs validate 2>&1 || true)"
if ! printf '%s' "$default_services" | rg -Fq 'local PostgreSQL 17 compatibility service'; then
  fail 'default local service validation did not visibly identify the PostgreSQL target'
fi

if MMDC_ENVIRONMENT=local MMDC_DATABASE_MODE=postgres DATABASE_URL='postgresql://mmdc@127.0.0.1:5432/mmdc_local' MMDC_LOCAL_SERVICE_BIND_ADDRESS=0.0.0.0 node scripts/local-services.mjs validate >/dev/null 2>&1; then
  fail 'non-loopback local service binding was accepted without confirmation'
fi

override_output="$(MMDC_ENVIRONMENT=local MMDC_DATABASE_MODE=postgres DATABASE_URL='postgresql://mmdc@127.0.0.1:5432/mmdc_local' MMDC_LOCAL_SERVICE_BIND_ADDRESS=0.0.0.0 MMDC_NON_LOOPBACK_CONFIRMATION=I_UNDERSTAND_NON_LOOPBACK_LOCAL_SERVICES node scripts/local-services.mjs validate 2>&1 || true)"
if ! printf '%s' "$override_output" | rg -Fq 'Local service bind: 0.0.0.0'; then
  fail 'documented non-loopback override was not accepted with its confirmation'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F03-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F03-T01 acceptance: pinned local Compose services, host application boundary, local media, database target guards, isolated mode probes, and loopback binding passed\n'
