#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
fixture_root=""
minio_container=""
minio_image='minio/minio:RELEASE.2024-06-13T22-53-53Z'

fail() {
  printf 'F05-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  [ -z "$minio_container" ] || docker rm -f "$minio_container" >/dev/null 2>&1 || true
  [ -z "$fixture_root" ] || rm -rf "$fixture_root"
}
trap cleanup EXIT

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in docker node pnpm rg curl; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint
run_check 'policy and IaC behavioral probe' node --experimental-strip-types tests/acceptance/F05-T01-probe.mjs policy

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f05-t01.XXXXXX")"
run_check 'local adapter selection probe' env -u S3_ACCESS_KEY_ID -u S3_SECRET_ACCESS_KEY \
  MMDC_ENVIRONMENT=local MMDC_MEDIA_STORAGE=local MMDC_COMPATIBILITY_DATABASE="file:$fixture_root/local.sqlite" \
  MMDC_MEDIA_DIR="$fixture_root/local-media" \
  DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' \
  DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' \
  PAYLOAD_SECRET='F05-T01-local-probe-secret' \
  node --experimental-strip-types tests/acceptance/F05-T01-probe.mjs selection-local

if ! docker image inspect "$minio_image" >/dev/null 2>&1; then
  run_check "pull pinned disposable S3 emulator $minio_image" docker pull "$minio_image"
fi

if [ "$errors" -eq 0 ]; then
  minio_container="mmdc-f05-t01-minio-$$"
  if ! docker run -d --name "$minio_container" \
    -e MINIO_ROOT_USER='f05t01app' \
    -e MINIO_ROOT_PASSWORD='F05-T01-disposable-password-123456' \
    -p 0:9000 "$minio_image" server /data >/dev/null; then
    fail 'disposable S3 emulator could not be started; no cloud evidence was fabricated'
  else
    minio_port="$(docker port "$minio_container" 9000/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
    if [ -z "$minio_port" ]; then
      fail 'disposable S3 emulator port could not be resolved'
    else
      minio_endpoint="http://127.0.0.1:$minio_port"
      ready=0
      for _ in $(seq 1 30); do
        if curl -fsS "$minio_endpoint/minio/health/live" >/dev/null 2>&1; then ready=1; break; fi
        sleep 1
      done
      if [ "$ready" -ne 1 ]; then
        fail 'disposable S3 emulator did not become ready'
      else
        runtime_env=(
          MMDC_ENVIRONMENT=development
          MMDC_DATABASE_MODE=postgres
          MMDC_MEDIA_STORAGE=s3
          MMDC_MEDIA_BUCKET=mmdc-f05-t01-development-media
          MMDC_MEDIA_REGION=us-east-1
          MMDC_MEDIA_ENDPOINT="$minio_endpoint"
          MMDC_MEDIA_FORCE_PATH_STYLE=1
          S3_ACCESS_KEY_ID=f05t01app
          S3_SECRET_ACCESS_KEY='F05-T01-disposable-password-123456'
          MMDC_COMPATIBILITY_DATABASE="file:$fixture_root/payload.sqlite"
          DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
          DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
          PAYLOAD_SECRET='F05-T01-hosted-probe-secret'
        )
        run_check 'hosted S3 upload, public denial, key isolation, and metadata persistence' env "${runtime_env[@]}" node --experimental-strip-types tests/acceptance/F05-T01-probe.mjs create
        run_check 'replacement-process media persistence and delete behavior' env "${runtime_env[@]}" node --experimental-strip-types tests/acceptance/F05-T01-probe.mjs verify
      fi
    fi
  fi
fi

if [ "$errors" -ne 0 ]; then
  printf 'F05-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F05-T01 acceptance: private IaC policy, explicit local/hosted adapters, S3 upload, public denial, collision-safe keys, replacement persistence, and deletion passed\n'
