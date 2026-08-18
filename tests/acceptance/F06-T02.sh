#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0
fixture_root=""
evidence_root="$ROOT/.artifacts/F06-T02"
image="mmdc-f06-t02:${PPID:-$$}"
project="mmdc-f06-t02-${PPID:-$$}"
compose_file="$ROOT/infrastructure/compose/production.yml"
runtime_env_file=""
compose_config=""
compose=()

fail() {
  printf 'F06-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cleanup() {
  if [ "${#compose[@]}" -gt 0 ] && command -v docker >/dev/null 2>&1; then
    "${compose[@]}" --profile smoke down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  [ -z "$image" ] || docker image rm "$image" >/dev/null 2>&1 || true
  [ -z "$fixture_root" ] || rm -rf "$fixture_root"
}
trap cleanup EXIT

cd "$ROOT"
mkdir -p "$evidence_root"

for command in docker node pnpm rg curl; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
if ! docker compose version >/dev/null 2>&1; then fail 'Docker Compose v2 is unavailable'; fi
if ! docker info >"$evidence_root/docker-info.txt" 2>&1; then
  fail 'Docker daemon is unavailable; container evidence cannot be fabricated'
  exit 1
fi

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint
[ "$errors" -eq 0 ] || exit 1

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f06-t02.XXXXXX")"
runtime_env_file="$fixture_root/runtime.env"
cat >"$runtime_env_file" <<'EOF'
MMDC_ENVIRONMENT=production
MMDC_DATABASE_MODE=postgres
DATABASE_URL=postgresql://mmdc:F06-T02-postgres-password@postgres:5432/mmdc_local_smoke
DATABASE_DIRECT_URL=postgresql://mmdc:F06-T02-postgres-password@postgres:5432/mmdc_local_smoke
PAYLOAD_SECRET=F06-T02-disposable-payload-secret
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_MASTER_KEY=F06-T02-disposable-meili-master-key-1234567890
MEILISEARCH_ADMIN_INDEXING_KEY=F06-T02-disposable-meili-admin-key
MEILISEARCH_SEARCH_ONLY_KEY=F06-T02-disposable-meili-search-key
MEILISEARCH_INDEX_PREFIX=mmdc
MMDC_MEDIA_STORAGE=s3
MMDC_MEDIA_BUCKET=mmdc-production-media
MMDC_MEDIA_REGION=us-east-1
MMDC_MEDIA_ENDPOINT=http://media:9000
MMDC_MEDIA_FORCE_PATH_STYLE=1
S3_ACCESS_KEY_ID=f06t02media
S3_SECRET_ACCESS_KEY=F06-T02-media-secret-key-123456
MMDC_WORKER_POLL_MS=100
MMDC_WORKER_LEASE_MS=5000
MMDC_WORKER_BATCH_SIZE=1
EOF

export MMDC_APPLICATION_IMAGE="$image"
export MMDC_APPLICATION_DIGEST=""
export MMDC_RUNTIME_ENV_FILE="$runtime_env_file"
export MMDC_COMPOSE_PROJECT_NAME="$project"
export MMDC_CADDY_BIND_ADDRESS=127.0.0.1
export MMDC_CADDY_HTTP_PORT=18080
export MMDC_CADDY_HTTPS_PORT=18443
export MMDC_SMOKE_POSTGRES_PASSWORD='F06-T02-postgres-password'
export MMDC_SMOKE_MEDIA_ACCESS_KEY='f06t02media'
export MMDC_SMOKE_MEDIA_SECRET_KEY='F06-T02-media-secret-key-123456'
export MEILISEARCH_MASTER_KEY='F06-T02-disposable-meili-master-key-1234567890'

if ! docker build --pull --tag "$image" . >"$evidence_root/image-build.log" 2>&1; then
  fail 'immutable application image build failed'
  exit 1
fi
image_digest="$(docker image inspect --format '{{.Id}}' "$image")"
if ! printf '%s' "$image_digest" | rg -q '^sha256:[0-9a-f]{64}$'; then
  fail "application image did not produce a sha256 digest: $image_digest"
  exit 1
fi
export MMDC_APPLICATION_DIGEST="$image_digest"
printf '%s\n' "$image_digest" >"$evidence_root/application-image.digest"
docker image inspect "$image" >"$evidence_root/application-image.inspect.json"

compose=(docker compose --project-name "$project" --file "$compose_file")
if ! compose_config="$("${compose[@]}" --profile smoke config --format json 2>"$evidence_root/compose-config.stderr")"; then
  fail 'production-like Compose configuration did not render'
  exit 1
fi
printf '%s\n' "$compose_config" >"$evidence_root/compose-config.json"

if ! COMPOSE_CONFIG="$compose_config" APPLICATION_DIGEST="$image_digest" node --input-type=module -e '
const config = JSON.parse(process.env.COMPOSE_CONFIG);
const expected = new Set(["application", "worker", "meilisearch", "caddy", "deployment-agent"]);
const services = config.services ?? {};
for (const name of expected) if (!services[name]) throw new Error(`missing service ${name}`);
for (const name of ["application", "worker", "meilisearch", "deployment-agent"]) {
  if ((services[name].ports ?? []).length) throw new Error(`${name} has an unintended published port`);
}
if ((services.caddy.ports ?? []).length !== 2) throw new Error("Caddy must publish HTTP and HTTPS only");
if (!services.application.image || services.application.image !== services.worker.image) throw new Error("application and worker do not share one image reference");
for (const [name, service] of Object.entries(services)) {
  if (!["unless-stopped", "no"].includes(service.restart)) throw new Error(`${name} has no reviewed restart policy`);
  if (!service.deploy?.resources?.limits?.cpus || !service.deploy?.resources?.limits?.memory) throw new Error(`${name} has no bounded resource limits`);
  if (service.logging?.driver !== "json-file" || service.logging?.options?.["max-size"] !== "10m" || service.logging?.options?.["max-file"] !== "5") throw new Error(`${name} has no bounded log rotation`);
}
if (!Object.keys(config.volumes ?? {}).some((name) => name.includes("meilisearch"))) throw new Error("Meilisearch has no persistent volume");
if (services.application.labels?.["com.mmdc.application.digest"] !== process.env.APPLICATION_DIGEST) throw new Error("application digest label is not captured");
'; then
  fail 'rendered Compose service, port, lifecycle, resource, log, persistence, or digest policy failed'
fi

if ! docker scout sbom --format spdx --output "$evidence_root/application-image.sbom.spdx.json" "local://$image" >"$evidence_root/sbom.log" 2>&1; then
  fail 'container SBOM generation failed; no SBOM evidence was fabricated'
fi
scanner_image='aquasec/trivy:0.56.2'
if ! docker image inspect "$scanner_image" >/dev/null 2>&1; then
  run_check "pull pinned vulnerability scanner $scanner_image" docker pull "$scanner_image"
fi
if ! docker save "$image" -o "$fixture_root/application-image.tar" >"$evidence_root/image-save.log" 2>&1; then
  fail 'application image archive for scanning could not be created'
fi
mkdir -p "$evidence_root/trivy-cache"
if ! docker run --rm \
  --volume "$fixture_root:/work:ro" \
  --volume "$evidence_root:/evidence" \
  --volume "$evidence_root/trivy-cache:/root/.cache/trivy" \
  "$scanner_image" image --input /work/application-image.tar \
  --scanners vuln --severity HIGH,CRITICAL --exit-code 0 --format sarif \
  --output /evidence/application-image.scan.sarif >"$evidence_root/scan.log" 2>&1; then
  fail 'container vulnerability scan failed; no scan evidence was fabricated'
fi
if ! docker run --rm \
  --volume "$fixture_root:/work:ro" \
  --volume "$evidence_root:/evidence" \
  --volume "$evidence_root/trivy-cache:/root/.cache/trivy" \
  "$scanner_image" image --input /work/application-image.tar \
  --scanners vuln --pkg-types library --severity CRITICAL --exit-code 1 --format json \
  --output /evidence/application-image.blocking-policy.json >"$evidence_root/blocking-policy.log" 2>&1; then
  fail 'container scan found an untriaged blocking application-layer vulnerability'
fi

if [ "$errors" -ne 0 ]; then exit 1; fi

if ! "${compose[@]}" --profile smoke up -d postgres meilisearch media >"$evidence_root/dependencies-up.log" 2>&1; then
  fail 'disposable PostgreSQL, Meilisearch, and media dependencies did not start'
  exit 1
fi

postgres_port=''
for _ in $(seq 1 60); do
  postgres_port="$("${compose[@]}" port postgres 5432 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -1)"
  if [ -n "$postgres_port" ] && "${compose[@]}" exec -T postgres pg_isready -U mmdc -d mmdc_local_smoke >/dev/null 2>&1; then break; fi
  sleep 1
done
if [ -z "$postgres_port" ]; then
  fail 'disposable PostgreSQL port/readiness was not available'
  exit 1
fi

host_database_url="postgresql://mmdc:F06-T02-postgres-password@127.0.0.1:$postgres_port/mmdc_local_smoke"
run_check 'disposable PostgreSQL migration' env \
  MMDC_ENVIRONMENT=ci MMDC_DATABASE_MODE=postgres MMDC_MEDIA_STORAGE=local \
  DATABASE_URL="$host_database_url" DATABASE_DIRECT_URL="$host_database_url" \
  PAYLOAD_SECRET=F06-T02-disposable-payload-secret pnpm run migrate:apply

if ! "${compose[@]}" up -d application worker deployment-agent caddy >"$evidence_root/runtime-up.log" 2>&1; then
  fail 'production-like application, worker, Caddy, and deployment-agent services did not start'
  exit 1
fi

caddy_port=''
for _ in $(seq 1 60); do
  caddy_port="$("${compose[@]}" port caddy 80 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -1)"
  if [ -n "$caddy_port" ] && live_body="$(curl -fsS "http://127.0.0.1:$caddy_port/api/health/live" 2>/dev/null)"; then break; fi
  sleep 1
done
if [ -z "$caddy_port" ] || [ "${live_body:-}" != '{"status":"ok"}' ]; then
  fail "Caddy/application liveness probe failed: ${live_body:-no response}"
  exit 1
fi
initial_ready=0
for _ in $(seq 1 60); do
  if body="$(curl -fsS "http://127.0.0.1:$caddy_port/api/health/ready" 2>/dev/null)" &&
    printf '%s' "$body" | rg -q '"status":"ready"'; then
    initial_ready=1
    break
  fi
  sleep 1
done
run_check 'initial readiness probe' test "$initial_ready" -eq 1

if ! "${compose[@]}" stop meilisearch >"$evidence_root/outage-stop.log" 2>&1; then fail 'dependency outage could not be simulated'; fi
run_check 'liveness during Meilisearch outage' bash -c 'test "$(curl -fsS "http://127.0.0.1:'"$caddy_port"'/api/health/live")" = '"'"'{"status":"ok"}'"'"''
readiness_outage_status="$(curl -sS -o "$evidence_root/readiness-outage.body" -w '%{http_code}' "http://127.0.0.1:$caddy_port/api/health/ready" 2>/dev/null || printf '000')"
if [ "$readiness_outage_status" = '200' ]; then
  fail 'readiness remained successful during a simulated dependency outage'
else
  run_check 'safe readiness failure during dependency outage' rg -q '"status":"not_ready"' "$evidence_root/readiness-outage.body"
fi
"${compose[@]}" up -d meilisearch >"$evidence_root/outage-restore.log" 2>&1 || fail 'Meilisearch could not be restored'
recovery_ready=0
for _ in $(seq 1 60); do
  if body="$(curl -fsS "http://127.0.0.1:$caddy_port/api/health/ready" 2>/dev/null)" &&
    printf '%s' "$body" | rg -q '"status":"ready"'; then
    recovery_ready=1
    break
  fi
  sleep 1
done
run_check 'readiness after dependency recovery' test "$recovery_ready" -eq 1

if ! "${compose[@]}" exec -T application node --input-type=module -e '
const key = process.env.MEILISEARCH_MASTER_KEY;
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const base = process.env.MEILISEARCH_URL;
const index = "f06-t02-persistence";
const create = await fetch(`${base}/indexes`, { method: "POST", headers, body: JSON.stringify({ uid: index, primaryKey: "id" }) });
if (!create.ok && create.status !== 409) throw new Error(`index create failed: ${create.status}`);
const write = await fetch(`${base}/indexes/${index}/documents`, { method: "POST", headers, body: JSON.stringify([{ id: "persisted", value: "F06-T02" }]) });
if (!write.ok) throw new Error(`document write failed: ${write.status}`);
await new Promise((resolve) => setTimeout(resolve, 500));
' >"$evidence_root/meili-write.log" 2>&1; then
  fail 'Meilisearch persistence seed failed'
fi
"${compose[@]}" stop meilisearch >/dev/null 2>&1 || true
"${compose[@]}" up -d meilisearch >/dev/null 2>&1 || true
for _ in $(seq 1 60); do
  if "${compose[@]}" exec -T application node --input-type=module -e '
const response = await fetch(`${process.env.MEILISEARCH_URL}/indexes/f06-t02-persistence/documents/persisted`, { headers: { Authorization: `Bearer ${process.env.MEILISEARCH_MASTER_KEY}` } });
if (!response.ok) process.exit(1);
const body = await response.json();
if (body.value !== "F06-T02") process.exit(1);
' >/dev/null 2>&1; then break; fi
  sleep 1
done
run_check 'persistent Meilisearch data after service restart' "${compose[@]}" exec -T application node --input-type=module -e '
const response = await fetch(`${process.env.MEILISEARCH_URL}/indexes/f06-t02-persistence/documents/persisted`, { headers: { Authorization: `Bearer ${process.env.MEILISEARCH_MASTER_KEY}` } });
if (!response.ok || (await response.json()).value !== "F06-T02") process.exit(1);
'

term_log="$evidence_root/application-sigterm.log"
"${compose[@]}" kill -s SIGTERM application >"$term_log" 2>&1 || fail 'application did not accept SIGTERM'
for _ in $(seq 1 30); do
  status="$("${compose[@]}" ps -a --format '{{.Service}} {{.State}}' | rg '^application ' || true)"
  if printf '%s' "$status" | rg -q 'exited|stopped'; then break; fi
  sleep 1
done
run_check 'SIGTERM graceful application shutdown' rg -q 'SIGTERM' <(docker logs "$project-application-1" 2>&1 || true)
"${compose[@]}" up -d application caddy >"$evidence_root/application-restart.log" 2>&1 || fail 'application could not be restarted after SIGTERM'
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$caddy_port/api/health/live" >/dev/null 2>&1; then break; fi
  sleep 1
done
run_check 'web traffic after graceful restart' curl -fsS "http://127.0.0.1:$caddy_port/api/health/live"

job_id="$("${compose[@]}" exec -T application node --experimental-strip-types --input-type=module -e '
import config from "./payload.config.ts";
import { getPayload } from "payload";
const payload = await getPayload({ config });
const job = await payload.jobs.queue({ task: "foundation-search-probe", input: { marker: "f06-t02-interrupted", durationMs: 10000 }, overrideAccess: true });
console.log(job.id);
process.exit(0);
' 2>"$evidence_root/job-queue.stderr" | tail -1)"
if ! printf '%s' "$job_id" | rg -q '^[0-9]+$'; then
  fail 'recoverable job could not be queued in disposable PostgreSQL'
else
  processing=0
  for _ in $(seq 1 60); do
    if "${compose[@]}" exec -T -e F06_JOB_ID="$job_id" application node --experimental-strip-types --input-type=module -e '
import config from "./payload.config.ts";
import { getPayload } from "payload";
const payload = await getPayload({ config });
const result = await payload.find({ collection: "payload-jobs", where: { id: { equals: process.env.F06_JOB_ID } }, limit: 1, overrideAccess: true });
if (result.docs[0]?.processing) process.exit(0);
process.exit(1);
' >/dev/null 2>&1; then processing=1; break; fi
    sleep 1
  done
  if [ "$processing" -ne 1 ]; then fail 'worker did not lease the interruption probe job'; fi
  "${compose[@]}" kill -s SIGKILL worker >"$evidence_root/worker-sigkill.log" 2>&1 || fail 'worker interruption could not be simulated'
  sleep 6
  "${compose[@]}" up -d worker >"$evidence_root/worker-recovery.log" 2>&1 || true
  recovered=0
  for _ in $(seq 1 90); do
    if "${compose[@]}" exec -T -e F06_JOB_ID="$job_id" application node --experimental-strip-types --input-type=module -e '
import config from "./payload.config.ts";
import { getPayload } from "payload";
const payload = await getPayload({ config });
const result = await payload.find({ collection: "payload-jobs", where: { id: { equals: process.env.F06_JOB_ID } }, limit: 1, overrideAccess: true });
const job = result.docs[0];
if (!job?.processing && job?.completedAt && !job.hasError) process.exit(0);
process.exit(1);
' >/dev/null 2>&1; then recovered=1; break; fi
    sleep 1
  done
  [ "$recovered" -eq 1 ] || fail 'interrupted job did not recover after worker restart'
fi

"${compose[@]}" ps >"$evidence_root/compose-ps.txt" 2>&1 || true
"${compose[@]}" logs --no-color >"$evidence_root/compose-logs.txt" 2>&1 || true
if [ "$errors" -ne 0 ]; then
  printf 'F06-T02 acceptance: %s check(s) failed; evidence is retained under %s\n' "$errors" "$evidence_root" >&2
  exit 1
fi

printf 'F06-T02 acceptance: Compose topology, private service boundaries, sanitized health outage behavior, SIGTERM, worker recovery, scan, SBOM, digest, limits, log rotation, persistence, and disposable end-to-end smoke passed; evidence retained under %s\n' "$evidence_root"
