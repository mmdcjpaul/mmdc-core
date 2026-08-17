#!/usr/bin/env bash
# Deterministic Codex implementation loop. See LOOP.md.
# Deliberately not `set -e`: failed attempts are handled explicitly.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$ROOT/docs/specs/tracker.md"
BLOCKED="$ROOT/BLOCKED.md"
LOGDIR="$ROOT/.loop-logs"

MODEL="${1:-${LOOP_MODEL:-}}"
REASONING_EFFORT="${2:-${LOOP_REASONING_EFFORT:-}}"
CODEX_BIN="${CODEX_BIN:-codex}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
GUARDED_MAX_ATTEMPTS="${GUARDED_MAX_ATTEMPTS:-1}"
MAX_TICKETS="${MAX_TICKETS:-0}"
NO_COMMIT="${NO_COMMIT:-}"
ALLOW_DIRTY="${ALLOW_DIRTY:-}"

if [ -z "$MODEL" ]; then
  printf 'Usage: %s <codex-model> [reasoning-effort]\n' "${0##*/}" >&2
  printf 'Or set LOOP_MODEL and optionally LOOP_REASONING_EFFORT.\n' >&2
  exit 2
fi

if [ -n "$REASONING_EFFORT" ] && [[ ! "$REASONING_EFFORT" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  printf 'loop: invalid reasoning effort: %s\n' "$REASONING_EFFORT" >&2
  exit 2
fi

for numeric_option in MAX_ATTEMPTS GUARDED_MAX_ATTEMPTS MAX_TICKETS; do
  numeric_value="${!numeric_option}"
  if ! [[ "$numeric_value" =~ ^[0-9]+$ ]] \
    || { [ "$numeric_option" != "MAX_TICKETS" ] && [ "$numeric_value" -eq 0 ]; }; then
    printf 'loop: %s must be %s\n' "$numeric_option" \
      "$([ "$numeric_option" = "MAX_TICKETS" ] && printf 'a non-negative integer' || printf 'a positive integer')" >&2
    exit 2
  fi
done

cd "$ROOT" || exit 1
mkdir -p "$LOGDIR"

log() { printf '\n\033[1m[loop]\033[0m %s\n' "$*"; }

control_fingerprint() {
  cksum AGENTS.md IMPLEMENTATION_PLAN.md validation.sh loop.sh docs/specs/README.md docs/specs/F*/SPEC.md \
    | cksum \
    | awk '{ print $1 ":" $2 }'
}

file_fingerprint() {
  cksum "$1" | awk '{ print $1 ":" $2 }'
}

tracker_rows() {
  awk -F'|' '
    /^\| *F[0-9][0-9]-T[0-9][0-9] *\|/ {
      for (i = 2; i <= 7; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
      print $2 "\t" $3 "\t" $4 "\t" $5 "\t" $6 "\t" $7
    }
  ' "$TRACKER"
}

next_ticket() {
  local active
  active="$(tracker_rows | awk -F'\t' '$4 == "In progress" { print $1; exit }')"
  if [ -n "$active" ]; then
    printf '%s\n' "$active"
    return
  fi
  tracker_rows | awk -F'\t' '$4 == "Not started" { print $1; exit }'
}

ticket_field() {
  local want="$1" column="$2"
  tracker_rows | awk -F'\t' -v want="$want" -v column="$column" '$1 == want { print $column; exit }'
}

ticket_autonomy() {
  local id="$1" spec
  spec="$(ticket_field "$id" 6)"
  awk -F': *' '$1 == "autonomy" { print $2; exit }' "$ROOT/$spec"
}

set_status() {
  local want="$1" status="$2" today total_count done_count blocked_count
  today="$(date +%Y-%m-%d)"
  awk -F'|' -v OFS='|' -v want="$want" -v new=" $status " -v today="$today" '
    /^last_updated:/ { print "last_updated: " today; next }
    /^\| *F[0-9][0-9]-T[0-9][0-9] *\|/ {
      id = $2
      gsub(/^[ \t]+|[ \t]+$/, "", id)
      if (id == want) $5 = new
    }
    { print }
  ' "$TRACKER" > "$TRACKER.tmp" && mv "$TRACKER.tmp" "$TRACKER"

  total_count="$(tracker_rows | wc -l | tr -d ' ')"
  done_count="$(tracker_rows | awk -F'\t' '$4 == "Done" { count++ } END { print count + 0 }')"
  blocked_count="$(tracker_rows | awk -F'\t' '$4 == "Blocked" { count++ } END { print count + 0 }')"
  awk -v total="$total_count" -v done="$done_count" -v blocked="$blocked_count" '
    /^progress_total:/ { print "progress_total: " total; next }
    /^progress_done:/ { print "progress_done: " done; next }
    /^progress_blocked:/ { print "progress_blocked: " blocked; next }
    { print }
  ' "$TRACKER" > "$TRACKER.tmp" && mv "$TRACKER.tmp" "$TRACKER"
}

dependencies_done() {
  local id="$1" dependencies dependency status
  dependencies="$(ticket_field "$id" 5)"
  [ "$dependencies" = "None" ] && return 0
  while IFS= read -r dependency; do
    dependency="${dependency//[[:space:]]/}"
    [ -n "$dependency" ] || continue
    status="$(ticket_field "$dependency" 4)"
    if [ "$status" != "Done" ]; then
      printf '%s is %s' "$dependency" "${status:-missing}"
      return 1
    fi
  done < <(printf '%s\n' "$dependencies" | tr ',' '\n')
}

build_prompt() {
  local id="$1" attempt="$2" attempt_limit="$3" verify_log="$4" spec title autonomy
  spec="$(ticket_field "$id" 6)"
  title="$(ticket_field "$id" 3)"
  autonomy="$(ticket_autonomy "$id")"
  if [ "$attempt" -eq 1 ]; then
    cat <<EOF
Implement ticket $id — $title.

Read repository instructions if present, then read IMPLEMENTATION_PLAN.md,
LOOP.md, docs/specs/README.md, $spec, and docs/specs/tracker.md.

Implement only $id. Follow every EARS SHALL and SHALL NOT literally. Satisfy
every acceptance criterion. Add an executable tests/acceptance/$id.sh that
checks every criterion deterministically; do not omit, weaken, or replace a
criterion with a superficial file-existence check when behavioral proof is
required. Reuse project test commands from the spec.

Run ./validation.sh $id and make it return 0. Do not edit ticket statuses;
loop.sh owns the tracker. Do not fabricate approvals, credentials, cloud
evidence, recovery rehearsals, or human decisions. If required authority or
external state is missing, explain the blocker and leave validation failing.
Do not work on any other ticket.

This ticket's declared autonomy is $autonomy. Complete all safe repository
engineering autonomously. Guarded means external approvals, credentials,
human decisions, or cloud mutations remain real gates; it does not permit
inventing evidence or weakening validation.
EOF
  else
    cat <<EOF
Repair ticket $id. Attempt $attempt of $attempt_limit.$([ "$attempt" -eq "$attempt_limit" ] && printf ' This is the final attempt.')

Read its spec again and fix the validation failure below. Do not delete or
weaken a test or requirement, fabricate evidence, edit tracker statuses, or
work on another ticket. Run ./validation.sh $id before finishing.

Validation output:

$(tail -n 160 "$verify_log" 2>/dev/null)
EOF
  fi
}

write_blocked() {
  local id="$1" title="$2" verify_log="$3" attempts="$4"
  if [ ! -f "$BLOCKED" ]; then
    printf '# Blocked tickets\n\nGenerated by loop.sh. The plan of record is docs/specs/tracker.md.\n' > "$BLOCKED"
  fi
  {
    printf '\n## %s — %s\n\n' "$id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '**Ticket:** %s\n\n' "$title"
    printf '**Attempts:** %s\n\n' "$attempts"
    printf '**Last validation output**\n\n```text\n'
    tail -n 60 "$verify_log" 2>/dev/null
    printf '\n```\n\n**Full logs:** `.loop-logs/%s-*`\n' "$id"
  } >> "$BLOCKED"
}

if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
  printf 'loop: Codex executable not found: %s\n' "$CODEX_BIN" >&2
  exit 1
fi

if ! ./validation.sh --specs; then
  printf 'loop: specification validation failed\n' >&2
  exit 1
fi

blocked_ticket="$(tracker_rows | awk -F'\t' '$4 == "Blocked" { print $1; exit }')"
if [ -n "$blocked_ticket" ]; then
  printf 'loop: %s is Blocked; resolve it and reset it to Not started before continuing\n' "$blocked_ticket" >&2
  exit 1
fi

active_ticket="$(tracker_rows | awk -F'\t' '$4 == "In progress" { print $1; exit }')"
if [ -z "$NO_COMMIT" ] && [ -z "$ALLOW_DIRTY" ] && [ -z "$active_ticket" ] \
  && git rev-parse --git-dir >/dev/null 2>&1 \
  && [ -n "$(git status --porcelain)" ]; then
  printf 'loop: working tree is not clean; commit/stash the baseline, set NO_COMMIT=1, or explicitly set ALLOW_DIRTY=1\n' >&2
  exit 1
fi

completed=0
while :; do
  ticket="$(next_ticket)"
  if [ -z "$ticket" ]; then
    log "No Not started or In progress tickets remain."
    exit 0
  fi

  if [ "$MAX_TICKETS" -gt 0 ] && [ "$completed" -ge "$MAX_TICKETS" ]; then
    log "Reached MAX_TICKETS=$MAX_TICKETS. Next: $ticket"
    exit 0
  fi

  if ! dependency_error="$(dependencies_done "$ticket")"; then
    log "$ticket cannot start because dependency $dependency_error."
    exit 1
  fi

  title="$(ticket_field "$ticket" 3)"
  autonomy="$(ticket_autonomy "$ticket")"
  if [ "$autonomy" != "autonomous" ] && [ "$autonomy" != "guarded" ]; then
    log "$ticket has invalid autonomy: ${autonomy:-missing}."
    exit 1
  fi
  attempt_limit="$MAX_ATTEMPTS"
  if [ "$autonomy" = "guarded" ] && [ "$GUARDED_MAX_ATTEMPTS" -lt "$attempt_limit" ]; then
    attempt_limit="$GUARDED_MAX_ATTEMPTS"
  fi

  log "$ticket — $title (autonomy: $autonomy, model: $MODEL, reasoning: ${REASONING_EFFORT:-default})"
  set_status "$ticket" "In progress"
  protected_fingerprint="$(control_fingerprint)"
  tracker_fingerprint="$(file_fingerprint "$TRACKER")"

  passed=0
  attempt=1
  verify_log="$LOGDIR/${ticket}-validation.log"
  while [ "$attempt" -le "$attempt_limit" ]; do
    agent_log="$LOGDIR/${ticket}-attempt-${attempt}.log"
    log "attempt $attempt/$attempt_limit"

    # --approve-for-me already selects the workspace-write sandbox. Codex CLI
    # rejects combining it with an explicit --sandbox option.
    codex_args=(exec --model "$MODEL" --approve-for-me --cd "$ROOT")
    if [ -n "$REASONING_EFFORT" ]; then
      codex_args+=(--config "model_reasoning_effort=\"$REASONING_EFFORT\"")
    fi

    build_prompt "$ticket" "$attempt" "$attempt_limit" "$verify_log" \
      | "$CODEX_BIN" "${codex_args[@]}" - 2>&1 \
      | tee "$agent_log"

    if [ "$(control_fingerprint)" != "$protected_fingerprint" ] || [ "$(file_fingerprint "$TRACKER")" != "$tracker_fingerprint" ]; then
      {
        printf 'validation: protected plan/spec/harness files or tracker status were modified by the implementation agent\n'
        printf 'validation: revert those edits; ticket behavior belongs in implementation files and tests/acceptance/%s.sh\n' "$ticket"
        git diff -- AGENTS.md IMPLEMENTATION_PLAN.md validation.sh loop.sh docs/specs/README.md docs/specs/tracker.md docs/specs/F*/SPEC.md 2>/dev/null || true
      } > "$verify_log"
    elif ./validation.sh "$ticket" > "$verify_log" 2>&1; then
      passed=1
      break
    fi

    log "validation failed"
    tail -n 30 "$verify_log"
    attempt=$((attempt + 1))
  done

  if [ "$passed" -ne 1 ]; then
    set_status "$ticket" "Blocked"
    write_blocked "$ticket" "$title" "$verify_log" "$attempt_limit"
    log "$ticket blocked after $attempt_limit attempt(s). Stopping."
    exit 1
  fi

  set_status "$ticket" "Done"
  log "$ticket passed and is Done"

  if [ -z "$NO_COMMIT" ] && git rev-parse --git-dir >/dev/null 2>&1; then
    git add -A
    if git commit -q -m "$ticket — $title"; then
      log "committed"
    else
      log "nothing committed (working tree unchanged or commit failed)"
    fi
  fi

  completed=$((completed + 1))
done
