#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
server_pid=""
fixture_root=""

fail() {
  printf 'F01-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  if [ -n "$fixture_root" ]; then
    rm -rf "$fixture_root"
  fi
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then
    fail "$description failed"
  fi
}

require_command node
require_command pnpm
require_command curl
require_command rg
cd "$ROOT"

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'frozen installation' pnpm install --frozen-lockfile
run_check 'format check' pnpm run format:check
run_check 'dependency/license/security triage' pnpm run check:dependencies
run_check 'type generation' pnpm run generate:types
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint

environment_output="$(mktemp "${TMPDIR:-/tmp}/mmdc-f01-t02-env.XXXXXX")"
if node --import tsx --input-type=module -e "import { loadEnvironment } from './src/environment.ts'; loadEnvironment({}, 'runtime')" >"$environment_output" 2>&1; then
  fail 'missing runtime environment was accepted'
elif ! rg -Fq 'PAYLOAD_SECRET' "$environment_output" || ! rg -Fq 'DATABASE_URL' "$environment_output"; then
  fail 'missing runtime environment did not identify required values'
elif rg -Fq 'F01-T02_SECRET_SENTINEL' "$environment_output"; then
  fail 'runtime validation output leaked a secret sentinel'
fi
rm -f "$environment_output"

build_log="$(mktemp "${TMPDIR:-/tmp}/mmdc-f01-t02-build.XXXXXX")"
if ! env -u PAYLOAD_SECRET -u DATABASE_URL -u DATABASE_DIRECT_URL -u INTERNAL_API_URL -u MMDC_COMPATIBILITY_DATABASE -u NEXT_PUBLIC_SITE_URL pnpm run build >"$build_log" 2>&1; then
  cat "$build_log" >&2
  fail 'database-independent production build failed'
fi
sentinel='F01-T02_SERVER_ONLY_SENTINEL'
if ! PAYLOAD_SECRET="$sentinel" DATABASE_URL='postgresql://127.0.0.1:1/mmdc-build-only' MMDC_BUILD=1 pnpm run build >"$build_log" 2>&1; then
  cat "$build_log" >&2
  fail 'production build with server-only sentinel failed'
elif rg -Fq "$sentinel" .next/static; then
  fail 'server-only sentinel was found in the generated client bundle'
fi
rm -f "$build_log"

run_check 'Sharp image processing' node --input-type=module -e "import sharp from 'sharp'; const output = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } } }).resize(1, 1).png().toBuffer(); if (output.length < 70) process.exit(1)"

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f01-t02.XXXXXX")"
server_log="$fixture_root/server.log"
compatibility_db="$fixture_root/payload.db"
PAYLOAD_SECRET='F01-T02-runtime-test-secret' \
DATABASE_URL='postgresql://127.0.0.1:1/mmdc-unavailable' \
MMDC_COMPATIBILITY_DATABASE="file:$compatibility_db" \
NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3102' \
PORT=3102 pnpm dev >"$server_log" 2>&1 &
server_pid=$!

ready=0
for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3102/ >"$fixture_root/home.html" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  sed -n '1,240p' "$server_log" >&2
  fail 'frontend shell did not boot'
else
  run_check 'public shell content' rg -Fq 'Website foundation' "$fixture_root/home.html"
  if ! curl -fsS -D "$fixture_root/admin.headers" http://127.0.0.1:3102/admin/login >"$fixture_root/admin.html"; then
    fail 'Payload Admin login route did not boot'
  else
    run_check 'Admin login content' rg -Fq 'Login - Payload' "$fixture_root/admin.html"
    run_check 'Admin Payload process header' rg -Fq 'Next.js, Payload' "$fixture_root/admin.headers"
  fi

  if ! curl -fsS -D "$fixture_root/api.headers" http://127.0.0.1:3102/api/foundation >"$fixture_root/api.json"; then
    fail 'Payload API route did not boot'
  else
    run_check 'Payload Local API probe' rg -Fq '"localAPI":"ready"' "$fixture_root/api.json"
    run_check 'Payload users collection probe' rg -Fq '"users"' "$fixture_root/api.json"
    run_check 'API Payload process header' rg -Fq 'Next.js, Payload' "$fixture_root/api.headers"
  fi
fi

if [ "$errors" -ne 0 ]; then
  printf 'F01-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F01-T02 acceptance: Payload routes, environment safety, build isolation, quality commands, Local API, Sharp, and triage passed\n'
