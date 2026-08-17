#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
fixture_root=""
start_pid=""

fail() {
  printf 'F03-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  if [ -n "$start_pid" ]; then
    kill "$start_pid" 2>/dev/null || true
    wait "$start_pid" 2>/dev/null || true
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

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

cd "$ROOT"
for command in node pnpm rg curl rsync sqlite3; do require_command "$command"; done

# R01: prove that the documented contract resolves through pnpm and that the
# repository's existing quality commands remain part of the repeatable path.
run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint

if ! node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const documentation = [
  readFileSync('README.md', 'utf8'),
  readFileSync('docs/runbooks/developer-workflow.md', 'utf8')
].join('\n');
const documented = [...documentation.matchAll(/pnpm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]);
const required = [
  'setup', 'start', 'health', 'stop', 'seed', 'reset', 'generate:types', 'migrate:create',
  'migrate:apply', 'worker', 'search:rebuild', 'test', 'typecheck', 'lint', 'build', 'container:smoke'
];
for (const command of required) {
  if (!manifest.scripts[command]) throw new Error(`missing executable package command: ${command}`);
  if (!documented.includes(command)) throw new Error(`command is not documented: ${command}`);
}
for (const command of new Set(documented)) {
  if (!manifest.scripts[command] && command !== 'help') throw new Error(`documentation names unknown package command: ${command}`);
}
const evidence = [readFileSync('README.md', 'utf8'), readFileSync('docs/runbooks/developer-workflow.md', 'utf8')].join('\n');
for (const term of [
  'macOS', 'Linux', 'Node.js', 'pnpm', 'Docker', 'DATABASE_URL', 'DATABASE_DIRECT_URL',
  'local PostgreSQL', 'isolated Neon', 'Measured elapsed time'
]) {
  if (!evidence.includes(term)) throw new Error(`documentation is missing prerequisite/measurement term: ${term}`);
}
NODE
then
  fail 'documented command contract and workstation evidence'
fi

# R04: exercise a real missing-prerequisite branch. The F06 artifact is not
# fabricated by this ticket; the command must fail safely and explain the next
# action without echoing a secret-shaped sentinel.
deferred_output="$(PAYLOAD_SECRET='F03-T02-secret-sentinel' pnpm run container:smoke 2>&1 || true)"
if ! printf '%s' "$deferred_output" | rg -q 'requires Dockerfile|production container'; then
  fail 'missing container prerequisite was not reported actionably'
fi
if printf '%s' "$deferred_output" | rg -Fq 'F03-T02-secret-sentinel'; then
  fail 'missing-prerequisite output exposed a secret sentinel'
fi
run_check 'worker command help' pnpm run worker -- --help
run_check 'search rebuild command help' pnpm run search:rebuild -- --help
run_check 'container smoke command help' pnpm run container:smoke -- --help

# R02/R03: copy the current checkout without installed modules or runtime
# state, then let setup install the frozen lockfile in an isolated environment.
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f03-t02.XXXXXX")"
fixture="$fixture_root/worktree"
mkdir -p "$fixture"
rsync -a --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.mmdc' --exclude 'media' --exclude '.loop-logs' "$ROOT/" "$fixture/"

cd "$fixture"
export MMDC_COMPATIBILITY_DATABASE="file:$fixture/.mmdc/compatibility.sqlite"
export MMDC_SKIP_LOCAL_SERVICES=1
export MMDC_DATABASE_TARGET_CONFIRMATION='local:postgres:local-postgres-compatibility'
export PAYLOAD_SECRET='F03-T02-runtime-secret-sentinel'
export DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
export DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
export NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3312'
export PORT=3312
mkdir -p "$fixture/.mmdc"

setup_first="$(now_ms)"
run_check 'isolated clean-checkout setup' pnpm run setup
setup_first_end="$(now_ms)"
env_hash_first="$(shasum .env.local package.json pnpm-lock.yaml payload-types.ts | shasum)"
run_check 'repeat isolated clean-checkout setup' pnpm run setup
setup_second_end="$(now_ms)"
env_hash_second="$(shasum .env.local package.json pnpm-lock.yaml payload-types.ts | shasum)"
if [ "$env_hash_first" != "$env_hash_second" ]; then
  fail 'repeated setup did not converge on the same declarative local state'
fi

assert_user_count() {
  local expected="$1"
  local count
  count="$(sqlite3 "$fixture/.mmdc/compatibility.sqlite" 'SELECT count(*) FROM users;' 2>/dev/null || true)"
  if [ -z "$count" ] && [ "$expected" = '0' ]; then count=0; fi
  if [ "$count" != "$expected" ]; then
    fail "local SQLite users table reported $count rows; expected $expected"
  fi
}

reset_first=""
for cycle in 1 2; do
  start_log="$fixture/.mmdc/start-$cycle.log"
  pnpm run start >"$start_log" 2>&1 &
  start_pid=$!
  run_check "start/health cycle $cycle" pnpm run health
  run_check "stop before data commands cycle $cycle" pnpm run stop
  wait "$start_pid" 2>/dev/null || true
  start_pid=""
  run_check "seed cycle $cycle" pnpm run seed
  assert_user_count 1
  reset_started="$(now_ms)"
  run_check "reset cycle $cycle" pnpm run reset
  reset_finished="$(now_ms)"
  if [ -z "$reset_first" ]; then reset_first=$((reset_finished - reset_started)); fi
  assert_user_count 0
  run_check "repeat stop cycle $cycle" pnpm run stop
  if pnpm run health >/dev/null 2>&1; then
    fail "health remained successful after stop cycle $cycle"
  fi
done

setup_first_elapsed=$((setup_first_end - setup_first))
setup_repeat_elapsed=$((setup_second_end - setup_first_end))
printf 'F03-T02 acceptance: measured setup=%sms repeat-setup=%sms reset=%sms\n' "$setup_first_elapsed" "$setup_repeat_elapsed" "${reset_first:-unavailable}"

if [ "$errors" -ne 0 ]; then
  printf 'F03-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F03-T02 acceptance: documented command contract, repeatable isolated setup/start/health/seed/reset/stop, workstation evidence, and safe prerequisite errors passed\n'
