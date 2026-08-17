#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
postgres_container=""
meilisearch_container=""

fail() {
  printf 'F04-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  [ -z "$meilisearch_container" ] || docker rm -f "$meilisearch_container" >/dev/null 2>&1 || true
  [ -z "$postgres_container" ] || docker rm -f "$postgres_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm rg docker curl; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint

if [ "$errors" -ne 0 ]; then exit 1; fi

master_key='F04-T02-disposable-master-key-1234567890'
postgres_container="mmdc-f04-t02-postgres-$$"
meilisearch_container="mmdc-f04-t02-meilisearch-$$"

if ! postgres_container_id="$(docker run -d --name "$postgres_container" -e POSTGRES_DB=mmdc_local -e POSTGRES_USER=mmdc -e POSTGRES_HOST_AUTH_METHOD=trust -p 0:5432 postgres:17)"; then
  fail 'disposable PostgreSQL service could not be started; no external service evidence was fabricated'
  exit 1
fi
if ! meilisearch_container_id="$(docker run -d --name "$meilisearch_container" -e MEILI_ENV=production -e MEILI_MASTER_KEY="$master_key" -e MEILI_NO_ANALYTICS=true -p 0:7700 getmeili/meilisearch:v1.51.0)"; then
  fail 'disposable Meilisearch service could not be started; no external service evidence was fabricated'
  exit 1
fi

postgres_port="$(docker port "$postgres_container" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
meilisearch_port="$(docker port "$meilisearch_container" 7700/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
if [ -z "$postgres_port" ] || [ -z "$meilisearch_port" ]; then
  fail 'disposable service ports could not be resolved'
  exit 1
fi

for attempt in $(seq 1 60); do
  if docker exec "$postgres_container" pg_isready -U mmdc -d mmdc_local >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 60 ]; then fail 'disposable PostgreSQL did not become ready'; exit 1; fi
  sleep 1
done
for attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$meilisearch_port/health" >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 60 ]; then fail 'disposable Meilisearch did not become ready'; exit 1; fi
  sleep 1
done

meilisearch_url="http://127.0.0.1:$meilisearch_port"
admin_key="$(curl -fsS -X POST "$meilisearch_url/keys" -H "Authorization: Bearer $master_key" -H 'Content-Type: application/json' -d '{"description":"F04-T02 admin indexing","actions":["indexes.create","indexes.get","indexes.delete","indexes.swap","documents.add","documents.get","documents.delete","tasks.get"],"indexes":["*"],"expiresAt":"2099-01-01T00:00:00Z"}' | node -e 'process.stdin.on("data", d => process.stdout.write(JSON.parse(d).key))')"
search_key="$(curl -fsS -X POST "$meilisearch_url/keys" -H "Authorization: Bearer $master_key" -H 'Content-Type: application/json' -d '{"description":"F04-T02 search only","actions":["search"],"indexes":["mmdc-foundation"],"expiresAt":"2099-01-01T00:00:00Z"}' | node -e 'process.stdin.on("data", d => process.stdout.write(JSON.parse(d).key))')"
if [ -z "$admin_key" ] || [ -z "$search_key" ]; then
  fail 'disposable Meilisearch did not issue distinct scoped keys'
  exit 1
fi

runtime_env=(
  MMDC_ENVIRONMENT=ci
  MMDC_DATABASE_MODE=postgres
  DATABASE_URL="postgresql://mmdc@127.0.0.1:$postgres_port/mmdc_local"
  DATABASE_DIRECT_URL="postgresql://mmdc@127.0.0.1:$postgres_port/mmdc_local"
  PAYLOAD_SECRET='F04-T02-disposable-payload-secret'
  MEILISEARCH_URL="$meilisearch_url"
  MEILISEARCH_MASTER_KEY="$master_key"
  MEILISEARCH_ADMIN_INDEXING_KEY="$admin_key"
  MEILISEARCH_SEARCH_ONLY_KEY="$search_key"
  MEILISEARCH_INDEX_PREFIX=mmdc
)

run_check 'PostgreSQL migrations' env "${runtime_env[@]}" pnpm run migrate:apply
run_check 'projection, rebuild, retry, and failure integration scenarios' env "${runtime_env[@]}" node --experimental-strip-types tests/acceptance/F04-T02-probe.mjs

if [ "$errors" -ne 0 ]; then
  printf 'F04-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F04-T02 acceptance: disposable PostgreSQL/Meilisearch integration covered duplicate, reordered, stale, rebuild, swap failure, deletion recovery, restart/retry, checksum preservation, and sanitized unavailability\n'
