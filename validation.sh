#!/usr/bin/env bash
# Validate the specification set, or one implemented ticket.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$ROOT/docs/specs/tracker.md"

fail() {
  printf 'validation: %s\n' "$*" >&2
  return 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

tracker_rows() {
  awk -F'|' '
    /^\| *F[0-9][0-9]-T[0-9][0-9] *\|/ {
      for (i = 2; i <= 7; i++) {
        gsub(/^[ \t]+|[ \t]+$/, "", $i)
      }
      print $2 "\t" $3 "\t" $4 "\t" $5 "\t" $6 "\t" $7
    }
  ' "$TRACKER"
}

validate_specs() {
  local errors=0 row_count=0 id feature title status depends spec extra
  local seen_file dependency dependency_status in_progress_count
  local requirement_count valid_requirement_count duplicate_requirement_count
  local declared_total declared_done declared_blocked actual_done actual_blocked

  [ -f "$TRACKER" ] || { fail "missing docs/specs/tracker.md"; return 1; }

  if [ ! -f "$ROOT/AGENTS.md" ]; then
    fail "missing repository-wide AGENTS.md"
    errors=$((errors + 1))
  elif ! rg -q 'Every AWS CLI invocation.*`mmdc` profile' "$ROOT/AGENTS.md" \
    || ! rg -q 'aws sts get-caller-identity --profile mmdc' "$ROOT/AGENTS.md" \
    || ! rg -q 'Do not use, modify, or rely on the AWS `default` profile' "$ROOT/AGENTS.md"; then
    fail "AGENTS.md must enforce the mmdc AWS profile and identity check"
    errors=$((errors + 1))
  fi

  while IFS=$'\t' read -r id feature title status depends spec extra; do
    [ -n "$id" ] || continue
    row_count=$((row_count + 1))

    case "$status" in
      "Not started"|"In progress"|"Done"|"Blocked") ;;
      *) fail "$id has invalid status: $status"; errors=$((errors + 1)) ;;
    esac

    if [ ! -f "$ROOT/$spec" ]; then
      fail "$id points to missing spec: $spec"
      errors=$((errors + 1))
      continue
    fi

    if ! rg -q "^id: $id$" "$ROOT/$spec"; then
      fail "$spec does not declare id: $id"
      errors=$((errors + 1))
    fi

    for heading in "## Intent" "## Requirements" "## Acceptance criteria" "## Validation" "## Dependencies" "## Traces"; do
      if ! rg -q "^${heading}$" "$ROOT/$spec"; then
        fail "$spec is missing $heading"
        errors=$((errors + 1))
      fi
    done

    requirement_count="$(rg -c "^- \*\*${id}-R[0-9][0-9]" "$ROOT/$spec" || true)"
    valid_requirement_count="$(rg -c "^- \*\*${id}-R[0-9][0-9] — (Ubiquitous|Event-driven|State-driven|Optional|Unwanted behavior|Prohibition):\*\* .*(SHALL|SHALL NOT)" "$ROOT/$spec" || true)"
    duplicate_requirement_count="$(rg -o "${id}-R[0-9][0-9]" "$ROOT/$spec" | sort | uniq -d | wc -l | tr -d ' ')"
    if [ "$requirement_count" -eq 0 ] || [ "$requirement_count" -ne "$valid_requirement_count" ]; then
      fail "$spec has a missing or malformed EARS requirement"
      errors=$((errors + 1))
    fi
    if [ "$duplicate_requirement_count" -ne 0 ]; then
      fail "$spec has duplicate requirement IDs"
      errors=$((errors + 1))
    fi

    if [ "$depends" != "None" ]; then
      while IFS= read -r dependency; do
        dependency="${dependency//[[:space:]]/}"
        [ -n "$dependency" ] || continue
        if [ "$dependency" = "$id" ]; then
          fail "$id depends on itself"
          errors=$((errors + 1))
        elif ! tracker_rows | cut -f1 | rg -Fxq "$dependency"; then
          fail "$id has unknown dependency: $dependency"
          errors=$((errors + 1))
        elif [ "$status" = "Done" ]; then
          dependency_status="$(tracker_rows | awk -F'\t' -v want="$dependency" '$1 == want { print $4; exit }')"
          if [ "$dependency_status" != "Done" ]; then
            fail "$id is Done but dependency $dependency is $dependency_status"
            errors=$((errors + 1))
          fi
        fi
      done < <(printf '%s\n' "$depends" | tr ',' '\n')
    fi
  done < <(tracker_rows)

  if [ "$row_count" -eq 0 ]; then
    fail "tracker contains no ticket rows"
    errors=$((errors + 1))
  fi

  if [ "$(tracker_rows | cut -f1 | sort | uniq -d | wc -l | tr -d ' ')" -ne 0 ]; then
    fail "tracker contains duplicate ticket IDs"
    errors=$((errors + 1))
  fi

  in_progress_count="$(tracker_rows | awk -F'\t' '$4 == "In progress" { count++ } END { print count + 0 }')"
  if [ "$in_progress_count" -gt 1 ]; then
    fail "tracker has $in_progress_count In progress tickets; at most one is allowed"
    errors=$((errors + 1))
  fi

  declared_total="$(awk -F': *' '$1 == "progress_total" { print $2; exit }' "$TRACKER")"
  declared_done="$(awk -F': *' '$1 == "progress_done" { print $2; exit }' "$TRACKER")"
  declared_blocked="$(awk -F': *' '$1 == "progress_blocked" { print $2; exit }' "$TRACKER")"
  actual_done="$(tracker_rows | awk -F'\t' '$4 == "Done" { count++ } END { print count + 0 }')"
  actual_blocked="$(tracker_rows | awk -F'\t' '$4 == "Blocked" { count++ } END { print count + 0 }')"
  if [ "$declared_total" != "$row_count" ] || [ "$declared_done" != "$actual_done" ] || [ "$declared_blocked" != "$actual_blocked" ]; then
    fail "tracker progress counters do not match ticket statuses"
    errors=$((errors + 1))
  fi

  while IFS= read -r seen_file; do
    if ! tracker_rows | cut -f6 | rg -Fxq "${seen_file#"$ROOT/"}"; then
      fail "untracked spec: ${seen_file#"$ROOT/"}"
      errors=$((errors + 1))
    fi
  done < <(find "$ROOT/docs/specs" -mindepth 2 -maxdepth 2 -name SPEC.md -type f | sort)

  if [ "$errors" -ne 0 ]; then
    return 1
  fi

  printf 'validation: %s ticket specifications are structurally valid\n' "$row_count"
}

spec_path_for() {
  local want="$1"
  tracker_rows | awk -F'\t' -v want="$want" '$1 == want { print $6; exit }'
}

validate_task() {
  local id="$1" spec acceptance
  spec="$(spec_path_for "$id")"
  [ -n "$spec" ] || { fail "unknown ticket: $id"; return 1; }

  acceptance="$ROOT/tests/acceptance/$id.sh"
  [ -f "$acceptance" ] || {
    fail "$id is not implemented: missing tests/acceptance/$id.sh"
    return 1
  }
  [ -x "$acceptance" ] || {
    fail "$acceptance is not executable"
    return 1
  }

  printf 'validation: running %s\n' "${acceptance#"$ROOT/"}"
  (cd "$ROOT" && "$acceptance")
}

usage() {
  printf 'Usage: %s --specs | Fnn-Tnn\n' "${0##*/}" >&2
}

case "${1:-}" in
  --specs)
    validate_specs
    ;;
  F[0-9][0-9]-T[0-9][0-9])
    validate_specs && validate_task "$1"
    ;;
  *)
    usage
    exit 2
    ;;
esac
