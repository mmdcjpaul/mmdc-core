#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
fixture_root=""
minio_container=""
minio_image='minio/minio:RELEASE.2024-06-13T22-53-53Z'

fail() {
  printf 'F05-T02 acceptance: %s\n' "$*" >&2
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
run_check 'production build' pnpm run build
if rg -n 'S3_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)|AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)|X-Amz-|s3\.amazonaws\.com|MMDC_MEDIA_ENDPOINT|F05-T02-(local|s3|outage)-probe-secret' .next/static >/dev/null 2>&1; then
  fail 'browser bundle contains a write credential, private signing material, or probe secret'
fi
run_check 'server media validation and anti-spoof scenarios' env \
  MMDC_ENVIRONMENT=local MMDC_MEDIA_STORAGE=local MMDC_COMPATIBILITY_DATABASE="file:$fixture_root/validation.sqlite" \
  DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' \
  PAYLOAD_SECRET='F05-T02-validation-probe-secret' node --experimental-strip-types tests/acceptance/F05-T02-probe.mjs validation

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f05-t02.XXXXXX")"
run_check 'local upload, metadata, access, delivery, resize, and persistence' env \
  MMDC_ENVIRONMENT=local MMDC_MEDIA_STORAGE=local MMDC_COMPATIBILITY_DATABASE="file:$fixture_root/local.sqlite" \
  MMDC_MEDIA_DIR="$fixture_root/local-media" DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' \
  DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' PAYLOAD_SECRET='F05-T02-local-probe-secret' \
  node --experimental-strip-types tests/acceptance/F05-T02-probe.mjs local-create
run_check 'local replacement-process restart and delivery' env \
  MMDC_ENVIRONMENT=local MMDC_MEDIA_STORAGE=local MMDC_COMPATIBILITY_DATABASE="file:$fixture_root/local.sqlite" \
  MMDC_MEDIA_DIR="$fixture_root/local-media" DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' \
  DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local' PAYLOAD_SECRET='F05-T02-local-probe-secret' \
  node --experimental-strip-types tests/acceptance/F05-T02-probe.mjs local-restart

if ! docker image inspect "$minio_image" >/dev/null 2>&1; then
  run_check "pull pinned disposable S3 emulator $minio_image" docker pull "$minio_image"
fi

if [ "$errors" -eq 0 ]; then
  minio_container="mmdc-f05-t02-minio-$$"
  if ! docker run -d --name "$minio_container" \
    -e MINIO_ROOT_USER='f05t02app' -e MINIO_ROOT_PASSWORD='F05-T02-disposable-password-123456' \
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
          MMDC_ENVIRONMENT=development MMDC_DATABASE_MODE=postgres MMDC_MEDIA_STORAGE=s3
          MMDC_MEDIA_BUCKET=mmdc-f05-t02-development-media MMDC_MEDIA_REGION=us-east-1
          MMDC_MEDIA_ENDPOINT="$minio_endpoint" MMDC_MEDIA_FORCE_PATH_STYLE=1
          S3_ACCESS_KEY_ID=f05t02app S3_SECRET_ACCESS_KEY='F05-T02-disposable-password-123456'
          MMDC_COMPATIBILITY_DATABASE="file:$fixture_root/s3.sqlite"
          DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
          DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
          PAYLOAD_SECRET='F05-T02-s3-probe-secret'
        )
        run_check 'S3 upload, authorized/unauthorized delivery, deterministic resize, and metadata' env "${runtime_env[@]}" \
          node --experimental-strip-types tests/acceptance/F05-T02-probe.mjs s3-create
        run_check 'S3 replacement-process persistence, deletion, version recovery, and restart' env "${runtime_env[@]}" \
          node --experimental-strip-types tests/acceptance/F05-T02-probe.mjs s3-verify
        outage_env=(
          MMDC_ENVIRONMENT=development MMDC_DATABASE_MODE=postgres MMDC_MEDIA_STORAGE=s3
          MMDC_MEDIA_BUCKET=mmdc-f05-t02-development-outage-media MMDC_MEDIA_REGION=us-east-1
          MMDC_MEDIA_ENDPOINT=http://127.0.0.1:1 MMDC_MEDIA_FORCE_PATH_STYLE=1
          S3_ACCESS_KEY_ID=f05t02app S3_SECRET_ACCESS_KEY='F05-T02-disposable-password-123456'
          MMDC_COMPATIBILITY_DATABASE="file:$fixture_root/outage.sqlite"
          MMDC_MEDIA_ALERT_FILE="$fixture_root/media-alerts.ndjson"
          DATABASE_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
          DATABASE_DIRECT_URL='postgresql://mmdc@127.0.0.1:1/mmdc_local'
          PAYLOAD_SECRET='F05-T02-outage-probe-secret'
        )
        run_check 'S3 outage metadata preservation, fallback, ineligibility, and alert' env "${outage_env[@]}" \
          node --experimental-strip-types tests/acceptance/F05-T02-probe.mjs s3-outage
      fi
    fi
  fi
fi

if [ "$errors" -ne 0 ]; then
  printf 'F05-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F05-T02 acceptance: validation, governed delivery, resize, restart, deletion, version recovery, outage fallback, alerting, and secret-leak scenarios passed\n'
