#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ADR_DIR="$ROOT/docs/adr"
TEMPLATE="$ADR_DIR/0000-template.md"
NEON="$ADR_DIR/0001-neon-replaces-colocated-postgresql.md"
HOST="$ADR_DIR/0002-lightsail-pull-authentication.md"
errors=0

fail() {
  printf 'F00-T01 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

require_file() {
  local path="$1"
  [ -f "$path" ] || fail "missing $path"
}

require_heading() {
  local path="$1" heading="$2"
  rg -Fqx "$heading" "$path" || fail "$(basename "$path") is missing heading: $heading"
}

require_text() {
  local path="$1" text="$2" description="$3"
  rg -Fq "$text" "$path" || fail "$(basename "$path") is missing $description"
}

require_regex() {
  local path="$1" pattern="$2" description="$3"
  rg -qU "$pattern" "$path" || fail "$(basename "$path") is missing $description"
}

require_file "$TEMPLATE"
require_file "$NEON"
require_file "$HOST"

# Both records must use the same concrete section contract as the repository
# template. This checks structure, not merely file names. The substantive
# checks intentionally continue after an approval failure so no criterion is
# hidden behind the missing-authority blocker.
for heading in "## Context" "## Decision" "### Owner" "### Rationale" \
  "### Alternatives considered" "### Consequences" "### Approval state" \
  "## Implementation boundaries" "## Verification"; do
  require_heading "$TEMPLATE" "$heading"
done
for adr in "$NEON" "$HOST"; do
  if [ -f "$adr" ]; then
    for heading in "## Context" "## Decision" "### Owner" "### Rationale" \
      "### Alternatives considered" "### Consequences" "### Approval state" \
      "## Implementation boundaries" "## Verification"; do
      require_heading "$adr" "$heading"
    done
    for field in "status:" "decision:" "owners:" "approval_state:" "approver:" "approved_at:"; do
      require_regex "$adr" "^${field}" "frontmatter field ${field}"
    done
    require_regex "$adr" '^# ADR-[0-9]{4} — ' "ADR title"
    # An accepted record must have no unresolved placeholder or blocker. If
    # the repository lacks a real human approval, this check fails explicitly.
    if rg -qi '^(status|approval_state):[[:space:]]*(Accepted|Approved)' "$adr"; then
      if rg -n -i 'TBD|TODO|<[^>]+>|not recorded|pending|blocked|not supplied|not been supplied' "$adr" >/dev/null; then
        fail "$(basename "$adr") has an unresolved placeholder/blocker in an accepted record"
      fi
      require_regex "$adr" '^approver:[[:space:]]*[^Nn<].+' "named approver in accepted record"
      require_regex "$adr" '^approved_at:[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}T' "approval timestamp in accepted record"
    else
      fail "$(basename "$adr") is not accepted by an accountable human"
    fi
  fi
done

# R01: canonical ownership, connection roles, and restore boundaries.
  require_text "$NEON" 'Neon is canonical for CMS records, users, versions, and jobs.' 'Neon canonical records'
  require_text "$NEON" 'S3 is canonical for media bytes; Payload is canonical for media metadata and' 'S3/Payload media boundary'
  require_text "$NEON" 'Meilisearch indexes and Next.js caches are disposable derived state.' 'disposable derived state'
  require_text "$NEON" '`DATABASE_URL` is the TLS-required pooled Neon URL' 'pooled runtime connection boundary'
  require_text "$NEON" '`DATABASE_DIRECT_URL` is the TLS-required direct Neon URL' 'direct administrative connection boundary'
  require_text "$NEON" 'standard `@payloadcms/db-postgres` adapter' 'Payload Postgres adapter boundary'
  require_text "$NEON" 'pre-migration Neon restore point' 'pre-migration restore point'
  require_text "$NEON" 'logical backup through `DATABASE_DIRECT_URL`' 'logical backup boundary'
  require_text "$NEON" 'temporary isolated branch/environment' 'isolated restore target'
  require_regex "$NEON" 'A live[[:space:]]+branch is never used as the restore test target\.' 'live-branch restore prohibition'
  require_text "$NEON" 'Lightsail snapshots cover host state and non-canonical' 'Lightsail snapshot boundary'
  if rg -qi 'shared environment.{0,80}(local|colocated) PostgreSQL|colocated.{0,80}canonical' "$NEON"; then
    fail "Neon ADR contains a contradictory colocated canonical-database claim"
  fi

# R02: concrete host permissions plus credential/bootstrap, rotation, and
# rejected-alternative behavior.
  require_text "$HOST" 'ecr:GetAuthorizationToken' 'ECR authorization action'
  require_text "$HOST" 'ecr:BatchCheckLayerAvailability' 'ECR layer-check action'
  require_text "$HOST" 'ecr:BatchGetImage' 'ECR image-read action'
  require_text "$HOST" 'ecr:GetDownloadUrlForLayer' 'ECR layer-download action'
  require_text "$HOST" 's3:GetObject' 'deployment-state read action'
  require_text "$HOST" 's3:PutObject' 'bounded status-write action'
  require_regex "$HOST" 'exact development[[:space:]]+desired-state[[:space:]]+prefix' 'deployment-state path scope'
  require_text "$HOST" 'approved bootstrap/secret channel' 'bootstrap handling'
  require_text "$HOST" 'root-readable protected runtime location' 'local credential protection'
  require_regex "$HOST" 'rotation interval and[[:space:]]+exposure-response procedure' 'rotation ownership'
  require_text "$HOST" 'revokes the old credential' 'old-credential revocation'
  require_text "$HOST" 'Long-lived administrator or account-root credentials were rejected' 'rejected broad credential alternative'
  require_text "$HOST" 'GitHub Actions inbound SSH was rejected' 'rejected inbound SSH alternative'
  require_regex "$HOST" 'No credential,[[:space:]]+account,[[:space:]]+hostname,[[:space:]]+region,[[:space:]]+authentication approval,[[:space:]]+or cloud access is claimed\.' 'anti-fabrication boundary'

# R03/R04: durable decisions must carry the complete decision metadata, and
# this implementation must not turn missing authority into an accepted claim.
for adr in "$NEON" "$HOST"; do
  [ -f "$adr" ] || continue
  require_text "$adr" '### Owner' 'owner field'
  require_text "$adr" '### Rationale' 'rationale field'
  require_text "$adr" '### Alternatives considered' 'alternatives field'
  require_text "$adr" '### Consequences' 'consequences field'
  require_text "$adr" '### Approval state' 'approval-state field'
done

if [ "$errors" -ne 0 ]; then
  printf 'F00-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F00-T01 acceptance: all architecture and access decision checks passed\n'
