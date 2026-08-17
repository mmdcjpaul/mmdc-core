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

frontmatter() {
  awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter && $0 == "---" { exit }
    in_frontmatter { print }
  ' "$1"
}

body() {
  awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter && $0 == "---" { in_frontmatter = 0; next }
    !in_frontmatter { print }
  ' "$1"
}

section() {
  local path="$1" wanted="$2"
  awk -v wanted="$wanted" '
    $0 == wanted {
      in_section = 1
      found = 1
      match($0, /^#+/)
      wanted_level = RLENGTH
      next
    }
    in_section && match($0, /^#+/) && RLENGTH <= wanted_level { exit }
    in_section { print }
    END { if (!found) exit 2 }
  ' "$path"
}

require_frontmatter_regex() {
  local path="$1" pattern="$2" description="$3"
  if ! frontmatter "$path" | rg -q "$pattern"; then
    fail "$(basename "$path") is missing $description in frontmatter"
  fi
}

require_nonempty_section() {
  local path="$1" heading="$2" content
  content="$(section "$path" "$heading" 2>/dev/null || true)"
  if [ -z "$(printf '%s' "$content" | tr -d '[:space:]')" ]; then
    fail "$(basename "$path") has an empty or missing $heading section"
  fi
}

require_no_unresolved_placeholders() {
  local path="$1" content metadata
  content="$(body "$path")"
  metadata="$(frontmatter "$path")"
  if printf '%s\n%s\n' "$metadata" "$content" | rg -ni 'TBD|TODO|<[^>[:space:]][^>]*>|not recorded|not supplied|not been supplied|pending|blocked' >/dev/null; then
    fail "$(basename "$path") contains an unresolved placeholder or blocker in an accepted section"
  fi
}

require_file "$TEMPLATE"
require_file "$NEON"
require_file "$HOST"

# The concrete ADR contract is derived from 0000-template.md. Requiring the
# frontmatter keys and all decision sections prevents a file-name-only pass.
template_fields=(
  'status:' 'decision:' 'owners:' 'approval_state:' 'approver:' 'approved_at:'
)
template_headings=(
  '## Context' '## Decision' '### Owner' '### Rationale'
  '### Alternatives considered' '### Consequences' '### Approval state'
  '## Implementation boundaries' '## Verification'
)
for field in "${template_fields[@]}"; do
  require_regex "$TEMPLATE" "^${field}" "template frontmatter field ${field}"
done
for heading in "${template_headings[@]}"; do
  require_heading "$TEMPLATE" "$heading"
done

for adr in "$NEON" "$HOST"; do
  if [ ! -f "$adr" ]; then
    continue
  fi
  for heading in "${template_headings[@]}"; do
    require_heading "$adr" "$heading"
    require_nonempty_section "$adr" "$heading"
  done
  for field in "${template_fields[@]}"; do
    require_frontmatter_regex "$adr" "^${field}" "frontmatter field ${field}"
  done
  require_regex "$adr" '^# ADR-[0-9]{4} — .+' 'ADR title'

  # An accepted ADR needs both accepted states, a named human approver, and a
  # real timestamp. The test cannot grant approval; it only verifies the
  # committed approval record and rejects the blocked/proposed form.
  require_frontmatter_regex "$adr" '^status:[[:space:]]*Accepted$' 'status: Accepted'
  require_frontmatter_regex "$adr" '^approval_state:[[:space:]]*Accepted$' 'approval_state: Accepted'
  require_frontmatter_regex "$adr" '^approver:[[:space:]]*[^[:space:]<][^<]*$' 'named approver'
  require_frontmatter_regex "$adr" '^approved_at:[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$' 'ISO approval timestamp'
  require_no_unresolved_placeholders "$adr"
done

# F00-T01-R01 and the plan traces in sections 3.2, 4, and 6: canonical data,
# connection roles, and recovery responsibilities must be explicit.
require_text "$NEON" 'Neon PostgreSQL replaces colocated shared-environment PostgreSQL' 'Neon replacement decision'
require_text "$NEON" 'Neon is canonical for CMS records, users, versions, and jobs.' 'Neon canonical records'
require_text "$NEON" 'S3 is canonical for media bytes; Payload is canonical for media metadata and' 'S3/Payload media boundary'
require_text "$NEON" 'Meilisearch indexes and Next.js caches are disposable derived state.' 'disposable derived state'
require_text "$NEON" 'The application and worker use the same image/configuration contract' 'shared app/worker configuration boundary'
require_text "$NEON" '`DATABASE_URL` is the TLS-required pooled Neon URL for application and worker' 'pooled runtime connection boundary'
require_text "$NEON" '`DATABASE_DIRECT_URL` is the TLS-required direct Neon URL used only for' 'direct administrative connection boundary'
require_text "$NEON" 'migrations, schema inspection, `pg_dump`, restore verification, and other' 'direct administrative operations'
require_text "$NEON" 'standard `@payloadcms/db-postgres` adapter' 'Payload Postgres adapter boundary'
require_text "$NEON" 'pre-migration Neon restore point' 'pre-migration restore point'
require_text "$NEON" 'logical backup through `DATABASE_DIRECT_URL`' 'logical backup boundary'
require_text "$NEON" 'temporary isolated branch/environment' 'isolated restore target'
require_text "$NEON" 'Each later persistent staging or production environment must have an' 'approved persistent-environment restore decision'
require_text "$NEON" 'provider default is not sufficient' 'provider-default restore prohibition'
require_regex "$NEON" 'Developer,[[:space:]]+CI,[[:space:]]+and temporary recovery branches have retention and automatic[[:space:]]+cleanup rules\.' 'branch retention and cleanup'
require_regex "$NEON" 'A live[[:space:]]+branch is never used as the restore test target\.' 'live-branch restore prohibition'
require_text "$NEON" 'Lightsail snapshots cover host state and non-canonical' 'Lightsail snapshot boundary'

# These are contradiction checks, rather than presence checks. They ensure a
# later edit cannot preserve one required phrase while reversing its meaning.
if rg -qi '(^|[^[:alnum:]_])(local|colocated)[[:space:]]+PostgreSQL.{0,100}canonical|canonical.{0,100}(local|colocated)[[:space:]]+PostgreSQL' "$NEON"; then
  fail "Neon ADR makes local/colocated PostgreSQL canonical"
fi
if rg -qi '`DATABASE_URL`[^\n]*(direct|migration|administrative)|`DATABASE_DIRECT_URL`[^\n]*(runtime|application|worker)' "$NEON"; then
  fail "Neon ADR reverses pooled/direct connection responsibilities"
fi
if rg -qi 'Meilisearch indexes[^\n]*(canonical|source of truth)|Next\.js caches[^\n]*(canonical|source of truth)' "$NEON"; then
  fail "Neon ADR makes derived state canonical"
fi
if rg -qi 'restore[^\n]*(live|production)[^\n]*(test|over)|test[^\n]*(live|production)[^\n]*restore' "$NEON"; then
  fail "Neon ADR permits restoring over a live target"
fi

# F00-T01-R02: the host-authentication decision must be concrete and least
# privilege must be visible in both the action list and its path boundaries.
require_text "$HOST" 'Lightsail pull deployment reuses the proven MMDC v3 scoped-host-credential pattern' 'host-authentication decision'
require_text "$HOST" 'ecr:GetAuthorizationToken' 'ECR authorization action'
require_text "$HOST" 'ecr:BatchCheckLayerAvailability' 'ECR layer-check action'
require_text "$HOST" 'ecr:BatchGetImage' 'ECR image-read action'
require_text "$HOST" 'ecr:GetDownloadUrlForLayer' 'ECR layer-download action'
require_text "$HOST" 'single development repository' 'single-repository ECR scope'
require_text "$HOST" 's3:GetObject' 'deployment-state read action'
require_text "$HOST" 's3:PutObject' 'bounded status-write action'
require_text "$HOST" 'exact development object' 'exact desired-state object scope'
require_text "$HOST" 'status/COMMIT_SHA.json' 'status object scope'
require_regex "$HOST" 'No bucket-wide listing,[[:space:]]+desired-state write, or unrelated environment access is granted\.' 'deployment-state prohibitions'
require_text "$HOST" 'approved bootstrap/secret channel' 'bootstrap handling'
require_text "$HOST" '/opt/mmdc/secrets/aws.env' 'protected credential path'
require_text "$HOST" 'root-readable protected runtime location' 'local credential protection'
require_text "$HOST" 'No credential value belongs in Git, the image, CloudFormation output, user' 'credential non-disclosure boundary'
require_regex "$HOST" 'rotation interval and[[:space:]]+exposure-response procedure' 'rotation ownership'
require_text "$HOST" 'creates a replacement key' 'replacement-key rotation'
require_text "$HOST" 'verifies desired-state read, ECR pull, and status write' 'replacement verification'
require_text "$HOST" 'revokes the old credential' 'old-credential revocation'
require_text "$HOST" 'suspected exposure triggers immediate revocation and re-bootstrap' 'exposure response'
require_text "$HOST" 'Long-lived administrator or account-root credentials were rejected' 'rejected broad credential alternative'
require_text "$HOST" 'GitHub Actions inbound SSH was rejected' 'rejected inbound SSH alternative'
require_text "$HOST" "Copying the operator's local \`mmdc\` profile to the host was rejected" 'rejected local-profile alternative'
require_text "$HOST" 'Unauthenticated or public ECR/deployment-state access was rejected' 'rejected public-access alternative'

if rg -qi '(^|[[:space:]])(iam:\*|s3:\*|ecr:\*|AdministratorAccess)([[:space:]]|$)' "$HOST"; then
  fail "host ADR grants an unbounded IAM, S3, ECR, or administrator permission"
fi
if rg -qi 'CI[^.\n]{0,80}receives inbound SSH|public ECR[^\n]*(granted|used)|unauthenticated[^\n]*(granted|used)' "$HOST"; then
  fail "host ADR contradicts the pull-only/private access design"
fi
if rg -qU 'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@' "$NEON" "$HOST"; then
  fail "ADR contains a credential or connection-string value"
fi

# F00-T01-R03/R04: every durable decision has the template's owner, rationale,
# alternatives, consequences, and approval sections. Approval is evidence, not
# something this autonomous test is allowed to create; the records also state
# the cloud/secret boundaries they do not claim.
for adr in "$NEON" "$HOST"; do
  [ -f "$adr" ] || continue
  require_text "$adr" '### Owner' 'owner field'
  require_text "$adr" '### Rationale' 'rationale field'
  require_text "$adr" '### Alternatives considered' 'alternatives field'
  require_text "$adr" '### Consequences' 'consequences field'
  require_text "$adr" '### Approval state' 'approval-state field'
  require_regex "$adr" 'Accepted by[[:space:]]+[^[:space:]].*[0-9]{4}-[0-9]{2}-[0-9]{2}T' 'approval evidence in the ADR'
done
require_regex "$NEON" 'No approval,?[[:space:]]*plan,?[[:space:]]*restore window,?[[:space:]]*or environment selection is inferred|The connection strings are runtime secrets and are not approval[[:space:]]+evidence\.' 'Neon non-fabrication boundary'
require_regex "$HOST" 'No AWS account access,[[:space:]]+hostname allocation,[[:space:]]+region change,[[:space:]]+secret value, or[[:space:]]+existing cloud resource is claimed\.' 'host non-fabrication boundary'

if [ "$errors" -ne 0 ]; then
  printf 'F00-T01 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F00-T01 acceptance: all architecture and access decision checks passed\n'
