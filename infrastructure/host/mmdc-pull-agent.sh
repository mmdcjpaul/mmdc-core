#!/usr/bin/env bash
set -Eeuo pipefail

# F08-T02 installs this file and proves --check readiness. F09-T02 adds the
# guarded --reconcile transaction. The host pulls an exact digest, runs one
# migration task from that image, and never builds application source.

config_file="${MMDC_PULL_AGENT_CONFIG:-/etc/mmdc/pull-agent.env}"
compose_dir="${MMDC_COMPOSE_DIR:-/etc/mmdc/compose}"
runtime_env="${MMDC_RUNTIME_ENV_FILE:-/etc/mmdc/runtime.env}"
deployment_root="${MMDC_DEPLOYMENT_ROOT:-/var/lib/mmdc/deployment}"
expected_environment="${MMDC_DEPLOYMENT_ENVIRONMENT:-development}"
probe_mode="${MMDC_PULL_AGENT_PROBE_MODE:-live}"
status_dir="${MMDC_STATUS_DIR:-$deployment_root/status}"
lock_file="${MMDC_DEPLOYMENT_LOCK_FILE:-$deployment_root/deploy.lock}"
fallback_lock_dir=''

fail() {
  printf 'mmdc pull agent: %s\n' "$*" >&2
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

load_config() {
  [[ -f "$config_file" ]] || fail "missing agent config: $config_file"
  # The file is root-owned configuration created by bootstrap, not desired
  # state. It contains no runtime secret values.
  set -a
  # shellcheck disable=SC1090
  . "$config_file"
  set +a
  compose_dir="${MMDC_COMPOSE_DIR:-$compose_dir}"
  runtime_env="${MMDC_RUNTIME_ENV_FILE:-$runtime_env}"
  deployment_root="${MMDC_DEPLOYMENT_ROOT:-$deployment_root}"
  expected_environment="${MMDC_DEPLOYMENT_ENVIRONMENT:-$expected_environment}"
  probe_mode="${MMDC_PULL_AGENT_PROBE_MODE:-$probe_mode}"
  status_dir="${MMDC_STATUS_DIR:-$deployment_root/status}"
  lock_file="${MMDC_DEPLOYMENT_LOCK_FILE:-$deployment_root/deploy.lock}"
}

check() {
  load_config
  [[ -d "$compose_dir" ]] || fail "missing Compose directory: $compose_dir"
  [[ -f "$compose_dir/shared.yml" && -f "$compose_dir/production.yml" ]] ||
    fail 'required Compose definitions are missing'
  [[ -f "$compose_dir/Caddyfile" ]] || fail 'Caddy configuration is missing'
  [[ -f "$runtime_env" ]] || fail "missing protected runtime environment file: $runtime_env"
  [[ "$(stat -c '%a' "$runtime_env" 2>/dev/null || stat -f '%Lp' "$runtime_env")" == '600' ]] ||
    fail 'runtime environment file must be mode 0600'
  require_command jq
  require_command sha256sum
  require_command docker
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is unavailable'
  if awk '/^[[:space:]]*command:/{capture=1} capture && /migrat(e|ion)/{exit 0} capture && /^[[:space:]]*[a-zA-Z0-9_-]+:/{capture=0} END{exit 1}' \
    "$compose_dir/production.yml"; then
    fail 'application or worker startup command contains a migration'
  fi
}

acquire_deployment_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$lock_file"
    flock -n 9 || return 1
    return 0
  fi
  fallback_lock_dir="${lock_file}.d"
  mkdir "$fallback_lock_dir" 2>/dev/null || return 1
  # mkdir is the portable atomic fallback on the Ubuntu host and disposable
  # harness. The marker is removed when this process exits.
  trap 'rmdir "$fallback_lock_dir" 2>/dev/null || true' EXIT
}

json_value() {
  jq -r "$1 // empty" "$2"
}

canonical_unsigned_hash() {
  local canonical
  canonical="$(jq -cS 'del(.integrity)' "$1")" || return 1
  printf '%s' "$canonical" | sha256sum | awk '{print $1}'
}

verify_desired_state() {
  local state_file="$1" tag git_sha repository digest migration_version migration_command compatibility
  local major minor patch dev expected_hash actual_hash release_order
  [[ -f "$state_file" ]] || return 1
  jq -e 'type == "object" and .schemaVersion == 1' "$state_file" >/dev/null || return 1
  [[ "$(json_value '.environment' "$state_file")" == "$expected_environment" ]] || return 1
  tag="$(json_value '.release.tag' "$state_file")"
  git_sha="$(json_value '.release.gitSha' "$state_file")"
  repository="$(json_value '.image.repository' "$state_file")"
  digest="$(json_value '.image.digest' "$state_file")"
  migration_version="$(json_value '.migration.version' "$state_file")"
  migration_command="$(json_value '.migration.command' "$state_file")"
  compatibility="$(json_value '.migration.compatibility' "$state_file")"
  [[ "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-dev\.(0|[1-9][0-9]*)$ ]] || return 1
  major="${BASH_REMATCH[1]}"; minor="${BASH_REMATCH[2]}"; patch="${BASH_REMATCH[3]}"; dev="${BASH_REMATCH[4]}"
  [[ "$git_sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$repository" =~ ^[A-Za-z0-9._/-]+$ && "$repository" != *:* && "$repository" != *@* ]] || return 1
  [[ "$(json_value '.image.gitShaTag' "$state_file")" == "$repository:$git_sha" ]] || return 1
  [[ "$(json_value '.release.semanticVersion' "$state_file")" == "$major.$minor.$patch-dev.$dev" ]] || return 1
  release_order="$(jq -c '.monotonic.releaseOrder' "$state_file")"
  [[ "$release_order" == "[$major,$minor,$patch,$dev]" ]] || return 1
  [[ "$(json_value '.monotonic.value' "$state_file")" == "$major.$minor.$patch.$dev" ]] || return 1
  [[ "$migration_command" == 'pnpm run migrate:apply' ]] || return 1
  [[ "$migration_version" =~ ^[A-Za-z0-9._-]+$ ]] || return 1
  [[ "$migration_version" == "$(json_value '.release.migrationVersion' "$state_file")" ]] || return 1
  [[ "$compatibility" == 'compatible' || "$compatibility" == 'incompatible' ]] || return 1
  jq -e '.evidence | type == "object" and (.sbomSha256|test("^[0-9a-f]{64}$")) and (.provenanceSha256|test("^[0-9a-f]{64}$")) and (.publicationSha256|test("^[0-9a-f]{64}$"))' "$state_file" >/dev/null || return 1
  jq -e --arg ref "refs/tags/$tag" '.workflow | .eventName == "push" and .refType == "tag" and .ref == $ref and (.workflowRef|type == "string" and length > 0) and (.runId|type == "string" and length > 0) and (.actor|type == "string" and length > 0)' "$state_file" >/dev/null || return 1
  expected_hash="$(json_value '.integrity.canonicalSha256' "$state_file")"
  actual_hash="$(canonical_unsigned_hash "$state_file")" || return 1
  [[ "$expected_hash" == "$actual_hash" ]] || return 1
  ! jq -c . "$state_file" | grep -Eiq '(^|[^a-z])latest([^a-z]|$)|postgres(ql)?://|password[=:]' || return 1
}

compare_orders() {
  local left="$1" right="$2" index l r
  for index in 0 1 2 3; do
    l="$(jq -r ".monotonic.releaseOrder[$index]" "$left")"
    r="$(jq -r ".monotonic.releaseOrder[$index]" "$right")"
    if ((l < r)); then printf '%s' '-1'; return; fi
    if ((l > r)); then printf '%s' '1'; return; fi
  done
  printf '%s' '0'
}

run_configured_probe() {
  local name="$1" variable="$2" command_value
  if [[ "$probe_mode" == 'fixture' ]]; then
    [[ -f "${MMDC_FIXTURE_READY_DIR:?}/$name.ready" ]] || return 1
    if [[ "$name" == 'health' ]]; then
      if [[ "${MMDC_FIXTURE_HEALTH_PHASE:-target}" == 'rollback' ]]; then
        [[ "${MMDC_FIXTURE_ROLLBACK_HEALTH_RESULT:-ok}" == 'ok' ]] || return 1
      else
        [[ "${MMDC_FIXTURE_HEALTH_RESULT:-ok}" == 'ok' ]] || return 1
      fi
    fi
    return 0
  fi
  command_value="${!variable:-}"
  [[ -n "$command_value" ]] || return 1
  bash -c "$command_value" >/dev/null 2>&1
}

validate_recovery_evidence() {
  local evidence_file="$1" migration_version="$2"
  [[ -f "$evidence_file" ]] || return 1
  jq -e --arg env "$expected_environment" --arg version "$migration_version" '
    type == "object" and .status == "ready" and .environment == $env and
    (.migrationVersion == $version) and (.recoveryPointId|type == "string" and length > 0) and
    (.logicalBackupPath|type == "string" and length > 0) and (.capturedAt|type == "string" and length > 0)
  ' "$evidence_file" >/dev/null || return 1
  ! jq -c . "$evidence_file" | grep -Eiq 'postgres(ql)?://|password[=:]|secret|token' || return 1
}

write_status() {
  local state_file="$1" status="$2" reason="$3" previous_digest="${4:-}" target_digest="${5:-}" migration_count="${6:-0}"
  local output temporary repository correlation_id release_id desired_state_integrity
  mkdir -p -m 0750 "$status_dir"
  output="$status_dir/unknown.json"
  if [[ -f "$state_file" ]]; then
    output="$status_dir/$(json_value '.release.gitSha' "$state_file").json"
  fi
  repository="$(json_value '.image.repository' "$state_file" 2>/dev/null || true)"
  correlation_id="$(json_value '.workflow.runId' "$state_file" 2>/dev/null || true)"
  release_id="${repository}@$(json_value '.release.tag' "$state_file" 2>/dev/null || true)"
  desired_state_integrity="$(json_value '.integrity.canonicalSha256' "$state_file" 2>/dev/null || true)"
  temporary="${output}.tmp.$$"
  jq -n \
    --arg environment "$expected_environment" \
    --arg status "$status" \
    --arg reason "$reason" \
    --arg previousDigest "$previous_digest" \
    --arg targetDigest "$target_digest" \
    --arg migrationVersion "$(json_value '.migration.version' "$state_file" 2>/dev/null || true)" \
    --arg gitSha "$(json_value '.release.gitSha' "$state_file" 2>/dev/null || true)" \
    --arg tag "$(json_value '.release.tag' "$state_file" 2>/dev/null || true)" \
    --arg releaseId "$release_id" \
    --arg correlationId "$correlation_id" \
    --arg desiredStateIntegrity "$desired_state_integrity" \
    --arg observedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg migrationCount "$migration_count" \
    '{schemaVersion: 1, environment: $environment, status: $status, reason: $reason, gitSha: $gitSha, tag: $tag, releaseId: $releaseId, correlationId: $correlationId, targetDigest: $targetDigest, previousDigest: $previousDigest, desiredStateIntegrity: $desiredStateIntegrity, migrationVersion: $migrationVersion, migrationCount: ($migrationCount|tonumber), observedAt: $observedAt, sanitized: true}' >"$temporary"
  [[ "$(wc -c <"$temporary")" -le "${MMDC_STATUS_MAX_BYTES:-8192}" ]] || {
    rm -f "$temporary"
    return 1
  }
  chmod 0640 "$temporary"
  mv -f "$temporary" "$output"
  if [[ -n "${MMDC_STATUS_PUBLISH_COMMAND:-}" ]]; then
    MMDC_STATUS_FILE="$output" bash -c "$MMDC_STATUS_PUBLISH_COMMAND" >/dev/null 2>&1 || return 1
  fi
}

fixture_action() {
  local action="$1" digest="$2" log_file="${MMDC_FIXTURE_ACTION_LOG:?}"
  printf '%s %s\n' "$action" "$digest" >>"$log_file"
  case "$action" in
    pull) [[ "${MMDC_FIXTURE_PULL_RESULT:-ok}" == 'ok' ]] ;;
    migrate)
      local count_file="${MMDC_FIXTURE_MIGRATION_COUNT_FILE:?}" count=0
      [[ -f "$count_file" ]] && count="$(cat "$count_file")"
      count=$((count + 1)); printf '%s\n' "$count" >"$count_file"
      if [[ -n "${MMDC_FIXTURE_MIGRATION_SLEEP:-}" ]]; then sleep "$MMDC_FIXTURE_MIGRATION_SLEEP"; fi
      [[ "$count" -eq 1 && "${MMDC_FIXTURE_MIGRATION_RESULT:-ok}" == 'ok' ]]
      ;;
    recreate) [[ "${MMDC_FIXTURE_RECREATE_RESULT:-ok}" == 'ok' ]] ;;
    rollback) [[ "${MMDC_FIXTURE_ROLLBACK_RESULT:-ok}" == 'ok' ]] ;;
    stop) return 0 ;;
    *) return 1 ;;
  esac
}

pull_exact_digest() {
  local image_ref="$1" repository="$2" digest="$3"
  if [[ "$probe_mode" == 'fixture' ]]; then
    fixture_action pull "$digest"
    return
  fi
  docker pull "$image_ref" >/dev/null 2>&1 || return 1
  docker image inspect --format '{{json .RepoDigests}}' "$image_ref" 2>/dev/null | grep -Fq "${repository}@${digest}"
}

write_migration_state() {
  local git_sha="$1" digest="$2" migration_version="$3" status="$4" state_file temporary
  state_file="$deployment_root/migration-$git_sha.state.json"
  temporary="${state_file}.tmp.$$"
  jq -n \
    --arg gitSha "$git_sha" \
    --arg digest "$digest" \
    --arg migrationVersion "$migration_version" \
    --arg status "$status" \
    --arg command 'pnpm run migrate:apply' \
    --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion: 1, gitSha: $gitSha, targetDigest: $digest, migrationVersion: $migrationVersion, command: $command, status: $status, recordedAt: $recordedAt}' \
    >"$temporary" || { rm -f "$temporary"; return 1; }
  chmod 0600 "$temporary"
  # rename(2) gives the host a complete attempted/failed/succeeded marker;
  # the marker is written before the migration container is invoked.
  mv -f "$temporary" "$state_file"
}

migration_state_status() {
  local git_sha="$1" state_file="$deployment_root/migration-$git_sha.state.json"
  if [[ ! -e "$state_file" ]]; then
    printf '%s' 'none'
    return 0
  fi
  jq -r 'if (.schemaVersion == 1 and (.status|IN("attempted", "failed", "succeeded"))) then .status else "invalid" end' \
    "$state_file" 2>/dev/null || printf '%s' 'invalid'
}

run_one_migration() {
  local image_ref="$1" git_sha="$2" digest="$3" migration_version="$4" state_status
  state_status="$(migration_state_status "$git_sha")"
  [[ "$state_status" == 'none' ]] || return 2
  write_migration_state "$git_sha" "$digest" "$migration_version" 'attempted' || return 3
  if [[ "$probe_mode" == 'fixture' ]]; then
    if ! fixture_action migrate "$image_ref"; then
      write_migration_state "$git_sha" "$digest" "$migration_version" 'failed' || return 3
      return 1
    fi
  else
    if [[ ! -f "$runtime_env" ]] || ! grep -Eq '^DATABASE_DIRECT_URL=[^[:space:]]+' "$runtime_env" ||
      ! docker run --rm --env-file "$runtime_env" --entrypoint pnpm "$image_ref" run migrate:apply >/dev/null 2>&1; then
      write_migration_state "$git_sha" "$digest" "$migration_version" 'failed' || return 3
      return 1
    fi
  fi
  write_migration_state "$git_sha" "$digest" "$migration_version" 'succeeded' || return 3
}

recreate_services() {
  local image_ref="$1" digest="$2"
  if [[ "$probe_mode" == 'fixture' ]]; then
    fixture_action recreate "$digest"
    return
  fi
  MMDC_APPLICATION_IMAGE="$image_ref" MMDC_APPLICATION_DIGEST="$digest" \
    docker compose --env-file "$runtime_env" -f "$compose_dir/production.yml" up -d --force-recreate --no-deps application worker >/dev/null 2>&1
}

rollback_services() {
  local image_ref="$1" digest="$2"
  if [[ "$probe_mode" == 'fixture' ]]; then
    fixture_action rollback "$digest"
    return
  fi
  MMDC_APPLICATION_IMAGE="$image_ref" MMDC_APPLICATION_DIGEST="$digest" \
    docker compose --env-file "$runtime_env" -f "$compose_dir/production.yml" up -d --force-recreate --no-deps application worker >/dev/null 2>&1
}

health_gate() {
  local name variable
  for pair in \
    'health:MMDC_POST_DEPLOY_HEALTH_COMMAND' \
    'route:MMDC_POST_DEPLOY_ROUTE_COMMAND' \
    'admin:MMDC_POST_DEPLOY_ADMIN_COMMAND' \
    'database:MMDC_POST_DEPLOY_DATABASE_COMMAND' \
    'search:MMDC_POST_DEPLOY_SEARCH_COMMAND' \
    'media:MMDC_POST_DEPLOY_MEDIA_COMMAND'; do
    name="${pair%%:*}"; variable="${pair##*:}"
    if ! run_configured_probe "$name" "$variable"; then return 1; fi
  done
}

reconcile() {
  local state_file="$1" current_file="$deployment_root/current.json" desired_file="$deployment_root/desired.json"
  local current_digest previous_state comparison target_digest repository git_sha tag migration_version compatibility image_ref
  local migration_result migration_reason
  mkdir -p -m 0750 "$deployment_root" "$status_dir"
  require_command jq; require_command sha256sum
  acquire_deployment_lock || { write_status "$state_file" 'busy' 'concurrent-deployment-in-progress'; return 1; }
  if ! verify_desired_state "$state_file"; then
    write_status "$state_file" 'rejected' 'desired-state-integrity-or-contract-failure' || true
    return 1
  fi
  if [[ -f "$current_file" ]]; then
    verify_desired_state "$current_file" || { write_status "$state_file" 'failed' 'active-state-is-invalid' || true; return 1; }
    previous_state="$current_file"
    current_digest="$(json_value '.image.digest' "$current_file")"
    comparison="$(compare_orders "$state_file" "$current_file")"
    if [[ "$comparison" == '0' ]]; then
      if [[ "$(canonical_unsigned_hash "$state_file")" == "$(canonical_unsigned_hash "$current_file")" ]]; then
        write_status "$state_file" 'idempotent' 'duplicate-desired-state' "$current_digest" "$current_digest" 0 || true
        return 0
      fi
      write_status "$state_file" 'rejected' 'same-release-has-different-state' "$current_digest" || true
      return 1
    fi
    if [[ "$comparison" == '-1' ]]; then
      write_status "$state_file" 'rejected' 'stale-desired-state' "$current_digest" || true
      return 1
    fi
  else
    write_status "$state_file" 'failed' 'no-known-good-current-state' || true
    return 1
  fi
  cp "$state_file" "$desired_file"
  target_digest="$(json_value '.image.digest' "$state_file")"
  repository="$(json_value '.image.repository' "$state_file")"
  git_sha="$(json_value '.release.gitSha' "$state_file")"
  tag="$(json_value '.release.tag' "$state_file")"
  migration_version="$(json_value '.migration.version' "$state_file")"
  compatibility="$(json_value '.migration.compatibility' "$state_file")"
  image_ref="$repository@$target_digest"
  case "$(migration_state_status "$git_sha")" in
    attempted|failed)
      write_status "$state_file" 'migration-failed' 'migration-attempt-already-recorded' "$current_digest" "$target_digest" 1 || true
      return 1
      ;;
    succeeded)
      write_status "$state_file" 'safe-state' 'migration-succeeded-awaiting-cutover' "$current_digest" "$target_digest" 1 || true
      return 1
      ;;
    invalid)
      write_status "$state_file" 'safe-state' 'migration-attempt-state-invalid' "$current_digest" "$target_digest" 1 || true
      return 1
      ;;
  esac
  if ! run_configured_probe neon MMDC_NEON_READINESS_COMMAND ||
    ! run_configured_probe s3 MMDC_S3_READINESS_COMMAND ||
    ! run_configured_probe meilisearch MMDC_MEILISEARCH_READINESS_COMMAND; then
    write_status "$state_file" 'failed' 'dependency-readiness-failed' "$current_digest" "$target_digest" 0 || true
    return 1
  fi
  if [[ -n "${MMDC_PRE_MIGRATION_RECOVERY_COMMAND:-}" ]]; then
    bash -c "$MMDC_PRE_MIGRATION_RECOVERY_COMMAND" >/dev/null 2>&1 || {
      write_status "$state_file" 'failed' 'recovery-evidence-creation-failed' "$current_digest" "$target_digest" 0 || true
      return 1
    }
  fi
  if ! validate_recovery_evidence "${MMDC_PRE_MIGRATION_RECOVERY_EVIDENCE:-$deployment_root/recovery.json}" "$migration_version"; then
    write_status "$state_file" 'failed' 'pre-migration-recovery-evidence-missing' "$current_digest" "$target_digest" 0 || true
    return 1
  fi
  pull_exact_digest "$image_ref" "$repository" "$target_digest" || {
    write_status "$state_file" 'failed' 'immutable-image-pull-or-verification-failed' "$current_digest" "$target_digest" 0 || true
    return 1
  }
  if run_one_migration "$image_ref" "$git_sha" "$target_digest" "$migration_version"; then
    migration_result=0
  else
    migration_result=$?
  fi
  if ((migration_result != 0)); then
    migration_reason='migration-failed-before-cutover'
    if ((migration_result == 2)); then migration_reason='migration-attempt-already-recorded'; fi
    if ((migration_result == 3)); then migration_reason='migration-attempt-state-persist-failed'; fi
    write_status "$state_file" 'migration-failed' "$migration_reason" "$current_digest" "$target_digest" 1 || true
    return 1
  fi
  recreate_services "$image_ref" "$target_digest" || {
    write_status "$state_file" 'failed' 'service-recreation-failed' "$current_digest" "$target_digest" 1 || true
    return 1
  }
  if [[ "$probe_mode" == 'fixture' ]]; then MMDC_FIXTURE_HEALTH_PHASE=target; fi
  if health_gate; then
    cp "$state_file" "$current_file"
    write_status "$state_file" 'succeeded' 'deployment-health-gate-passed' "$current_digest" "$target_digest" 1 || true
    printf 'mmdc pull agent: deployed %s (%s)\n' "$tag" "$git_sha"
    return 0
  fi
  if [[ "$compatibility" == 'compatible' ]] && rollback_services "$repository@$current_digest" "$current_digest"; then
    if [[ "$probe_mode" == 'fixture' ]]; then MMDC_FIXTURE_HEALTH_PHASE=rollback; fi
    if health_gate; then
    write_status "$state_file" 'rolled-back' 'target-health-failed-compatible-rollback' "$current_digest" "$target_digest" 1 || true
    return 1
    fi
  fi
  if [[ "$probe_mode" == 'fixture' ]]; then fixture_action stop "$target_digest" || true; else docker compose --env-file "$runtime_env" -f "$compose_dir/production.yml" stop application worker >/dev/null 2>&1 || true; fi
  write_status "$state_file" 'safe-state' 'target-health-failed-incompatible-or-rollback-failed' "$current_digest" "$target_digest" 1 || true
  return 1
}

main() {
  local mode="${1:---check}" state_file
  load_config
  case "$mode" in
    --check)
      check
      printf 'mmdc pull agent readiness passed; deployment transitions are available only through guarded --reconcile\n'
      ;;
    --reconcile)
      state_file="${2:-${MMDC_DESIRED_STATE_FILE:-}}"
      [[ -n "$state_file" ]] || fail 'a desired-state file is required for --reconcile'
      reconcile "$state_file"
      ;;
    *)
      fail "unsupported mode: $mode"
      ;;
  esac
}

main "$@"
