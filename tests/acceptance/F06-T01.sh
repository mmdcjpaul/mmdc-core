#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
image="mmdc-f06-t01:${PPID:-$$}"
web_container="mmdc-f06-t01-web-${PPID:-$$}"
worker_container="mmdc-f06-t01-worker-${PPID:-$$}"
inspect_container="mmdc-f06-t01-inspect-${PPID:-$$}"
fixture_root=""

fail() {
  printf 'F06-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

cleanup() {
  [ -z "$web_container" ] || docker rm -fv "$web_container" >/dev/null 2>&1 || true
  [ -z "$worker_container" ] || docker rm -fv "$worker_container" >/dev/null 2>&1 || true
  [ -z "$inspect_container" ] || docker rm -fv "$inspect_container" >/dev/null 2>&1 || true
  [ -z "$image" ] || docker image rm "$image" >/dev/null 2>&1 || true
  [ -z "$fixture_root" ] || rm -rf "$fixture_root"
}
trap cleanup EXIT

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in docker node pnpm rg curl tar; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[ "$errors" -eq 0 ] || exit 1

if ! docker info >/dev/null 2>&1; then
  fail 'Docker daemon is unavailable; image evidence cannot be fabricated'
  exit 1
fi

# Reuse the repository quality contract before building the single image.
run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint
[ "$errors" -eq 0 ] || exit 1

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f06-t01.XXXXXX")"
image_root="$fixture_root/image-root"
mkdir -p "$image_root"
runtime_secret='F06-T01-RUNTIME-SECRET-SENTINEL'

# Build exactly once with all credentials absent from the build environment.
if ! env -u PAYLOAD_SECRET -u DATABASE_URL -u DATABASE_DIRECT_URL \
  -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  docker build --pull --tag "$image" .; then
  fail 'immutable production image build failed'
  exit 1
fi

image_id="$(docker image inspect --format '{{.Id}}' "$image")"
[ -n "$image_id" ] || fail 'built image did not expose a local immutable image ID'
case "$image_id" in sha256:*) ;; *) fail "built image ID is not a sha256 digest: $image_id" ;; esac

base_digest='sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d'
run_check 'pinned glibc Node 24 bookworm base declaration' \
  rg -Fq "ARG NODE_IMAGE=node:24.15.0-bookworm-slim@${base_digest}" Dockerfile
resolved_base_digest="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.base.digest"}}' "$image")"
[ "$resolved_base_digest" = "$base_digest" ] || fail "image base label is $resolved_base_digest, expected $base_digest"
run_check 'standalone Next configuration' rg -Fq "output: 'standalone'" next.config.mjs

image_user="$(docker image inspect --format '{{.Config.User}}' "$image")"
[ "$image_user" = 'node' ] || fail "image default user is $image_user, expected node"
runtime_uid="$(docker run --rm --entrypoint node "$image" -e 'process.stdout.write(String(process.getuid()))')"
[ "$runtime_uid" = '1000' ] || fail "runtime UID is $runtime_uid, expected non-root UID 1000"

image_config="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image")"
if printf '%s\n' "$image_config" | rg -q '^(PAYLOAD_SECRET|DATABASE_URL|DATABASE_DIRECT_URL|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)='; then
  fail 'image configuration contains an embedded runtime credential'
fi

history="$(docker history --no-trunc --format '{{.CreatedBy}}' "$image")"
if printf '%s\n' "$history" | rg -i -q 'PAYLOAD_SECRET|DATABASE_URL=|DATABASE_DIRECT_URL=|AWS_SECRET_ACCESS_KEY|F06-T01-(BUILD|RUNTIME)-SECRET'; then
  fail 'image history contains a credential or secret sentinel'
fi

# Export the actual runtime filesystem and inspect its contents, not just the
# source tree or Dockerfile. The build context excludes environment files and
# the runtime stage installs production dependencies only.
if ! docker create --name "$inspect_container" "$image" >/dev/null; then
  fail 'runtime filesystem inspection container could not be created'
else
  if ! docker export "$inspect_container" | tar -xf - -C "$image_root"; then
    fail 'runtime filesystem export failed'
  else
    file_list="$fixture_root/files.txt"
    find "$image_root" -xdev -print >"$file_list"
    if rg -n '(^|/)(\.env([.]|$)|\.npmrc$|\.pnpm-store|\.cache/(pnpm|node-gyp))|/app/(pnpm-lock[.]yaml|package-lock[.]json|yarn[.]lock)$' "$file_list"; then
      fail 'runtime filesystem contains an environment file, package-manager cache, or lockfile'
    fi
    if rg -n '/app/node_modules/((typescript|tsx|eslint|prettier|tailwindcss|autoprefixer)(/|$)|@types/)' "$file_list"; then
      fail 'runtime filesystem contains a source-only development toolchain'
    fi
    if rg -n '(^|/)(etc/apt/sources[.]list([.]d)?|etc/apt/sources[.]list[.]d/)' "$file_list"; then
      fail 'runtime filesystem contains unnecessary Debian package source definitions'
    fi
    if rg -a -n -F "$runtime_secret" "$image_root"; then
      fail 'runtime filesystem contains the runtime secret sentinel'
    fi
    if rg -n '/app/(credentials|secrets)([.]|/|$)|/app/src/.*[.](pem|key)$' "$file_list"; then
      fail 'runtime filesystem contains a source credential file'
    fi
  fi
fi

runtime_env=(
  --env MMDC_ENVIRONMENT=ci
  --env MMDC_DATABASE_MODE=postgres
  --env "DATABASE_URL=postgresql://mmdc:f06-runtime@127.0.0.1:1/mmdc_local"
  --env "DATABASE_DIRECT_URL=postgresql://mmdc:f06-runtime@127.0.0.1:1/mmdc_local"
  --env "PAYLOAD_SECRET=$runtime_secret"
  --env MMDC_MEDIA_STORAGE=local
  --env MMDC_COMPATIBILITY_DATABASE=file:/tmp/f06-t01-web.sqlite
  --env PORT=3000
  --env HOSTNAME=0.0.0.0
)

worker_env=(
  --env NODE_ENV=development
  --env MMDC_ENVIRONMENT=ci
  --env MMDC_DATABASE_MODE=postgres
  --env "DATABASE_URL=postgresql://mmdc:f06-runtime@127.0.0.1:1/mmdc_local"
  --env "DATABASE_DIRECT_URL=postgresql://mmdc:f06-runtime@127.0.0.1:1/mmdc_local"
  --env "PAYLOAD_SECRET=$runtime_secret"
  --env MMDC_MEDIA_STORAGE=local
  --env MMDC_COMPATIBILITY_DATABASE=file:/tmp/f06-t01-worker.sqlite
  --env MMDC_WORKER_BATCH_SIZE=1
)

if ! docker run --detach --name "$web_container" --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m -p 127.0.0.1::3000 \
  "${runtime_env[@]}" "$image" web >/dev/null; then
  fail 'web process did not start from the built image'
else
  web_image_id="$(docker inspect --format '{{.Image}}' "$web_container")"
  [ "$web_image_id" = "$image_id" ] || fail 'web container does not reference the built image digest'

  web_port=''
  web_body=''
  for _ in $(seq 1 60); do
    web_port="$(docker port "$web_container" 3000/tcp 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -1)"
    if [ -n "$web_port" ] && web_body="$(curl -fsS "http://127.0.0.1:$web_port/api/health" 2>/dev/null)"; then
      break
    fi
    sleep 1
  done
  [ "$web_body" = '{"status":"ok"}' ] || fail "read-only web health probe returned: $web_body"

  home_body="$(curl -fsS "http://127.0.0.1:${web_port:-1}/" 2>/dev/null || true)"
  printf '%s' "$home_body" | rg -Fq 'Website foundation' || fail 'Next standalone frontend probe failed'
  if docker exec "$web_container" sh -c 'touch /app/should-not-be-writable' >/dev/null 2>&1; then
    fail 'read-only root filesystem allowed a write under /app'
  fi
  run_check 'bounded tmpfs write location' docker exec "$web_container" sh -c 'touch /tmp/f06-t01-write-probe'
  if docker logs "$web_container" 2>&1 | rg -Fq "$runtime_secret"; then
    fail 'web logs exposed the runtime secret sentinel'
  fi
fi

if ! docker create --name "$worker_container" --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  "${worker_env[@]}" \
  "$image" worker --once >/dev/null; then
  fail 'worker process could not be created from the built image'
else
  worker_image_id="$(docker inspect --format '{{.Image}}' "$worker_container")"
  [ "$worker_image_id" = "$image_id" ] || fail 'worker container does not reference the same image digest as web'
  if ! worker_output="$(docker start --attach "$worker_container" 2>&1)"; then
    fail "worker --once probe failed: $worker_output"
  else
    printf '%s\n' "$worker_output" | rg -Fq '"event":"worker.started"' || fail 'worker start event was not observed'
    printf '%s\n' "$worker_output" | rg -Fq '"event":"worker.stopped"' || fail 'worker stop event was not observed'
    if printf '%s\n' "$worker_output" | rg -Fq "$runtime_secret"; then
      fail 'worker output exposed the runtime secret sentinel'
    fi
  fi
fi

sharp_probe='import sharp from "sharp"; const input = { create: { width: 2, height: 2, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } } }; const output = await sharp(input).resize(1, 1).png().toBuffer(); const metadata = await sharp(output).metadata(); if (sharp.versions.sharp !== "0.34.5" || metadata.width !== 1 || metadata.height !== 1 || output.length < 70) process.exit(1); console.log("sharp 0.34.5 glibc transform passed");'
run_check 'glibc Sharp runtime transform' docker run --rm --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m "$image" exec node --input-type=module -e "$sharp_probe"

run_check 'standalone server runtime file' docker run --rm --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m "$image" exec node --input-type=module -e \
  'import { access } from "node:fs/promises"; await access("/app/server.js");'

if [ "$errors" -ne 0 ]; then
  printf 'F06-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F06-T01 acceptance: one digest-pinned multi-stage image passed filesystem, secret, non-root, read-only, web, worker, runtime-config, standalone, and Sharp probes\n'
