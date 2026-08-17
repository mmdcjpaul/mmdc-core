#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
container_name="mmdc-f02-t01-acceptance"
database_url='postgresql://mmdc:mmdc-test-only@127.0.0.1:55432/mmdc'

fail() {
  printf 'F02-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
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
for command in docker node pnpm rg cmp; do require_command "$command"; done

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint

if ! docker image inspect postgres:17 >/dev/null 2>&1; then
  fail 'pinned postgres:17 image is unavailable; refusing an unpinned database substitute'
else
  run_check 'postgres 17 container start' docker run --rm --name "$container_name" -e POSTGRES_USER=mmdc -e POSTGRES_PASSWORD=mmdc-test-only -e POSTGRES_DB=mmdc -p 55432:5432 -d postgres:17
  ready=0
  for _ in $(seq 1 30); do
    if docker exec "$container_name" pg_isready -U mmdc -d mmdc >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    fail 'postgres 17 container did not become ready'
  else
    run_check 'empty PostgreSQL schema reset' docker exec "$container_name" psql -U mmdc -d mmdc -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    run_check 'initial migration on empty PostgreSQL 17' env DATABASE_URL="$database_url" DATABASE_DIRECT_URL="$database_url" PAYLOAD_SECRET='F02-T01-test-secret' pnpm run migrate
    run_check 'migration status tracking' env DATABASE_URL="$database_url" DATABASE_DIRECT_URL="$database_url" PAYLOAD_SECRET='F02-T01-test-secret' pnpm run migrate:status
    run_check 'idempotent second migration invocation' env DATABASE_URL="$database_url" DATABASE_DIRECT_URL="$database_url" PAYLOAD_SECRET='F02-T01-test-secret' pnpm run migrate

    migration_file="$(find src/migrations -maxdepth 1 -type f -name '*.ts' ! -name index.ts -print -quit)"
    migration_name="$(basename "$migration_file" .ts)"
    migration_count="$(docker exec "$container_name" psql -U mmdc -d mmdc -Atc "SELECT count(*) FROM payload_migrations WHERE name = '$migration_name';" 2>/dev/null || true)"
    if [ "$migration_count" != '1' ]; then
      fail "migration was not tracked exactly once (count=${migration_count:-unavailable})"
    fi

    probe_env=(DATABASE_URL="$database_url" DATABASE_DIRECT_URL="$database_url" PAYLOAD_SECRET='F02-T01-test-secret')
    run_check 'schema and access probe' env "${probe_env[@]}" node --experimental-strip-types tests/acceptance/F02-T01-probe.mjs create
    run_check 'process restart persistence probe' env "${probe_env[@]}" node --experimental-strip-types tests/acceptance/F02-T01-probe.mjs verify
    run_check 'schema push rejection in shared runtime config' env "${probe_env[@]}" DATABASE_POOL_MAX=7 DATABASE_CONNECTION_TIMEOUT_MS=321 DATABASE_IDLE_TIMEOUT_MS=2345 MMDC_ENVIRONMENT=production MMDC_SCHEMA_PUSH=1 node --experimental-strip-types --input-type=module -e "import config from './payload.config.ts'; import { getPayload } from 'payload'; const payload = await getPayload({ config }); const pool = payload.db.poolOptions; if (payload.db.name !== 'postgres' || payload.db.push !== false || pool.connectionString !== process.env.DATABASE_URL || pool.max !== 7 || pool.connectionTimeoutMillis !== 321 || pool.idleTimeoutMillis !== 2345) process.exit(1); if (payload.config.collections.some(({ slug }) => slug === 'payload-jobs')) process.exit(1); void payload.destroy(); process.exit(0);"
  fi
fi

types_tmp="$(mktemp "${TMPDIR:-/tmp}/mmdc-f02-t01-types.XXXXXX")"
rm -f "$types_tmp"
if ! env PAYLOAD_TS_OUTPUT_PATH="$types_tmp" pnpm run generate:types >/dev/null; then
  fail 'generated Payload type regeneration failed'
elif ! cmp -s payload-types.ts "$types_tmp"; then
  fail 'committed payload-types.ts is stale; generated types must be refreshed in the same change'
fi
rm -f "$types_tmp"

if ! rg -q "@payloadcms/db-postgres" payload.config.ts || ! rg -q 'connectionString: environment\.internal\.databaseURL' payload.config.ts; then
  fail 'Payload Postgres adapter is not sourced from pooled DATABASE_URL'
fi
if ! rg -q 'max: environment\.internal\.databasePoolMax' payload.config.ts || ! rg -q 'connectionTimeoutMillis|idleTimeoutMillis' payload.config.ts; then
  fail 'bounded Postgres pool and timeout settings are not explicit'
fi
if rg -q 'push:\s*true' payload.config.ts; then
  fail 'schema push is enabled in Payload configuration'
fi
if ! rg -q 'DATABASE_DIRECT_URL' scripts/payload-migrate.mjs || ! rg -q 'MMDC_MIGRATION' scripts/payload-migrate.mjs; then
  fail 'migration command does not require the separately invoked direct connection'
fi
if rg -q 'postgresql://[^[:space:]]+:[^[:space:]]+@|F02-T01_SECRET_SENTINEL' tests/acceptance/F02-T01-probe.mjs docs/evidence/F02-T01* 2>/dev/null; then
  fail 'acceptance/evidence files contain a credential-like value'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F02-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F02-T01 acceptance: Payload schema, roles, access, media metadata, migration tracking, restart persistence, generated types, bounded Postgres runtime, and shared push rejection passed\n'
