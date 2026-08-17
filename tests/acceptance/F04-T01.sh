#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
fixture_root=""

fail() {
  printf 'F04-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  [ -z "$fixture_root" ] || rm -rf "$fixture_root"
}
trap cleanup EXIT

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm rg; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint
run_check 'key-boundary, production image mode, and private-network probe' \
  env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  node --experimental-strip-types tests/acceptance/F04-T01-probe.mjs

help_output="$(pnpm run worker -- --help 2>&1 || true)"
if ! printf '%s' "$help_output" | rg -q 'Payload worker|--once'; then
  fail 'worker command did not expose its executable runtime contract'
fi
if printf '%s' "$help_output" | rg -q 'placeholder|reserved'; then
  fail 'worker command still reports a placeholder/deferred implementation'
fi

sentinel='F04-T01-PRIVILEGED-KEY-SENTINEL'
run_check 'production build' env \
  MEILISEARCH_MASTER_KEY="$sentinel-master" \
  MEILISEARCH_ADMIN_INDEXING_KEY="$sentinel-admin" \
  MEILISEARCH_SEARCH_ONLY_KEY="$sentinel-search" \
  MEILISEARCH_URL='http://127.0.0.1:7700' \
  pnpm run build

if rg -F "$sentinel" .next/static .next/server 2>/dev/null; then
  fail 'privileged key sentinel was found in a rendered build artifact'
fi
run_check 'sanitized public response probe' env \
  node --experimental-strip-types tests/acceptance/F04-T01-public-probe.mjs

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f04-t01.XXXXXX")"
runtime_db="file:$fixture_root/worker.sqlite"
marker_file="$fixture_root/worker-markers.log"

run_check 'worker retry and interruption probe' env \
  F04_WORKER_DATABASE="$runtime_db" \
  F04_WORKER_MARKER="$marker_file" \
  MMDC_COMPATIBILITY_DATABASE="$runtime_db" \
  DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' \
  DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' \
  PAYLOAD_SECRET='F04-T01-worker-runtime-secret' \
  node --experimental-strip-types tests/acceptance/F04-T01-worker-probe.mjs

if [ "$errors" -ne 0 ]; then
  printf 'F04-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F04-T01 acceptance: key boundaries, bundle/public-response leak checks, private production Meilisearch, distinct web/worker commands, bounded retries, and forced interruption recovery passed\n'
