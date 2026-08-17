#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REG_DIR="$ROOT/docs/registers"
POLICY="$ROOT/docs/policies/branch-tag-deployment-policy.md"
errors=0

fail() {
  printf 'F00-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

require_file() {
  local path="$1"
  [ -f "$path" ] || fail "missing $path"
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

require_frontmatter() {
  local path="$1" field="$2" pattern="$3" description="$4"
  if ! frontmatter "$path" | rg -q "^${field}:[[:space:]]*${pattern}$"; then
    fail "$(basename "$path") is missing ${description} in frontmatter"
  fi
}

require_heading() {
  local path="$1" heading="$2"
  rg -Fqx "$heading" "$path" || fail "$(basename "$path") is missing heading: $heading"
}

check_table() {
  local path="$1" expected_fields="$2" description="$3" heading="${4:-}" table_errors
  table_errors="$(awk -F'|' -v expected="$expected_fields" -v heading="$heading" '
    heading != "" && $0 == heading { in_table = 1; next }
    heading != "" && !in_table { next }
    heading != "" && in_table && /^## / { exit }
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }
    /^\|/ {
      if ($0 ~ /^\|[[:space:]]*---/) next
      if (NF != expected + 2) {
        print "wrong column count"
        next
      }
      for (i = 2; i <= expected + 1; i++) {
        if (trim($i) == "") print "empty cell"
      }
    }
  ' "$path")"
  [ -z "$table_errors" ] || fail "$(basename "$path") has an incomplete $description table"
}

require_row() {
  local path="$1" text="$2" description="$3"
  require_regex "$path" "^\\|[[:space:]]*${text}[[:space:]]*\\|" "$description row"
}

require_decision_column() {
  local path="$1" table_name="$2" column="$3" rows_without_state
  rows_without_state="$(awk -F'|' -v column="$column" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }
    /^\|/ {
      if ($0 ~ /^\|[[:space:]]*---/) next
      if ($0 ~ /Decision state/) next
      if (trim($(column + 1)) !~ /^(Approved|Blocked)([[:space:]:]|$)/) print NR
    }
  ' "$path")"
  [ -z "$rows_without_state" ] || fail "$(basename "$path") has non-explicit states in $table_name: $rows_without_state"
}

require_secret_name() {
  local name="$1"
  require_regex "$REG_DIR/secret-inventory.md" "\\|[[:space:]]*\`?${name}\`?[[:space:]]*\\|" "secret inventory entry ${name}"
}

ENV_REGISTER="$REG_DIR/environment-register.md"
OWNER_REGISTER="$REG_DIR/ownership-approval-matrix.md"
SECRET_REGISTER="$REG_DIR/secret-inventory.md"
COST_REGISTER="$REG_DIR/cost-retention-register.md"
CONTRACT="$REG_DIR/README.md"

for path in "$CONTRACT" "$ENV_REGISTER" "$OWNER_REGISTER" "$SECRET_REGISTER" "$COST_REGISTER" "$POLICY"; do
  require_file "$path"
done

# The four registers share a lintable, versioned schema. The policy has the
# same review metadata and an explicit guarded decision state.
for register in "$ENV_REGISTER" "$OWNER_REGISTER" "$SECRET_REGISTER" "$COST_REGISTER"; do
  require_frontmatter "$register" register '[a-z0-9-]+' 'register identifier'
  require_frontmatter "$register" version '1[.]0' 'version: 1.0'
  require_frontmatter "$register" status 'Active' 'status: Active'
  require_frontmatter "$register" accountable_owner '.+' 'accountable owner'
  require_frontmatter "$register" last_reviewed '2026-08-17' 'last-reviewed date'
  require_frontmatter "$register" review_cadence '.+' 'review cadence'
  for heading in '## Scope' '## Accountable owner' '## Records' '## Change and review'; do
    require_heading "$register" "$heading"
  done
  require_regex "$register" '^## Records$' 'records section'
done

require_frontmatter "$POLICY" policy 'branch-and-semantic-tag-protection' 'policy identifier'
require_frontmatter "$POLICY" version '1[.]0' 'version: 1.0'
require_frontmatter "$POLICY" status 'Blocked' 'blocked policy status'
require_frontmatter "$POLICY" decision_state 'Blocked' 'blocked decision state'
require_frontmatter "$POLICY" accountable_owner '.+' 'policy accountable owner'
require_frontmatter "$POLICY" approver 'None' 'explicit absent approver for a blocked decision'
require_frontmatter "$POLICY" approved_at 'None' 'explicit absent approval date for a blocked decision'
require_frontmatter "$POLICY" last_reviewed '2026-08-17' 'last-reviewed date'
require_frontmatter "$POLICY" review_cadence '.+' 'review cadence'
for heading in '## Scope' '## Accountable owner' '## Branch creation and update rules' '## Stable required checks' '## Semantic deployment-tag rules' '## Guarded decision' '## Change and review'; do
  require_heading "$POLICY" "$heading"
done

# F00-T02-R01: every named environment has all seven boundary columns and an
# accountable role. The table parser proves populated records, not filenames.
  check_table "$ENV_REGISTER" 10 'environment allocation' '## Records'
for environment in Local CI Development Staging Production; do
  require_row "$ENV_REGISTER" "$environment" "environment $environment"
done
for boundary in 'Database boundary' 'Media boundary' 'Search boundary' 'Deployment boundary' 'Region boundary' 'Data class and default data' 'Credential and role boundary'; do
  require_text "$ENV_REGISTER" "$boundary" "environment $boundary column"
done
require_text "$ENV_REGISTER" 'Dedicated non-production Neon project/root branch' 'development database boundary'
require_text "$ENV_REGISTER" 'Separate paid Neon project in Singapore' 'production database boundary'
require_text "$ENV_REGISTER" 'Dedicated private development S3 bucket' 'development media boundary'
require_text "$ENV_REGISTER" 'Separate private production bucket' 'production media boundary'
require_text "$ENV_REGISTER" 'Immutable `vX.Y.Z-dev.N` digest' 'development deployment boundary'
require_text "$ENV_REGISTER" 'Immutable `vX.Y.Z-rc.N` digest' 'staging deployment boundary'
require_text "$ENV_REGISTER" 'Stable immutable `vX.Y.Z` digest' 'production deployment boundary'
require_text "$ENV_REGISTER" 'Synthetic data by default' 'non-production data boundary'

# F00-T02-R02: the required subjects are rows with owner, approval evidence,
# retained-evidence, and explicit state columns.
  check_table "$OWNER_REGISTER" 5 'ownership and approval matrix' '## Records'
for subject in Engineering Product AWS Neon DNS Security 'Schema migrations and migration compatibility' 'Development and staging deployments' 'Production deployment' 'Neon restore or database cutover' 'Break-glass access'; do
  require_regex "$OWNER_REGISTER" "^\\|[^|]*${subject}[^|]*\\|" "ownership subject ${subject}"
done
for column in 'Accountable owner role' 'Required approver role' 'Evidence to retain' 'Decision state'; do
  require_text "$OWNER_REGISTER" "$column" "ownership $column column"
done
require_text "$OWNER_REGISTER" 'Engineering repository owner' 'branch/tag policy owner'
require_text "$OWNER_REGISTER" 'Development deployment approver (Engineering)' 'development deployment approval owner'
require_text "$OWNER_REGISTER" 'Production deployment approver (Product, Engineering, and Security)' 'production deployment approval ownership'
require_text "$OWNER_REGISTER" 'Neon restore approver and Engineering lead' 'restore approval ownership'
require_text "$OWNER_REGISTER" 'Two-person approval: Security owner and the affected system owner' 'break-glass approval ownership'
require_decision_column "$OWNER_REGISTER" 'ownership and approval' 5

# F00-T02-R03: each inventory record has the required metadata, and the
# inventory names the planned secret classes without embedding values.
check_table "$SECRET_REGISTER" 6 'secret inventory'
for column in 'Secret name or secret class' 'Environment scope' 'Owner role' 'Storage location class' 'Rotation rule' 'Exposure response'; do
  require_text "$SECRET_REGISTER" "$column" "secret $column column"
done
for secret_name in PAYLOAD_SECRET PAYLOAD_PREVIEW_SECRET DATABASE_URL DATABASE_DIRECT_URL NEON_RUNTIME_ROLE_PASSWORD NEON_MIGRATION_ROLE_PASSWORD MEILI_ADMIN_KEY MEILI_SEARCH_KEY S3_WORKLOAD_IDENTITY_OR_CREDENTIAL HOST_AWS_PULL_CREDENTIAL DEPLOYMENT_STATE_INTEGRITY_KEY EDGE_BASIC_AUTH_CREDENTIAL CLOUDFRONT_ORIGIN_VERIFY_VALUE OBSERVABILITY_DESTINATION_CREDENTIAL; do
  require_secret_name "$secret_name"
done
require_text "$SECRET_REGISTER" 'Production records must not be reused by local, CI, development, or staging' 'production/non-production secret separation rule'
require_text "$SECRET_REGISTER" 'non-production records must not be promoted into production' 'non-production secret promotion prohibition'
require_text "$SECRET_REGISTER" 'contains no secret values' 'secret non-disclosure rule'

# F00-T02-R05: all named cost subjects have an estimate and complete lifecycle
# controls. This verifies policy-bearing cells rather than merely a cost title.
check_table "$COST_REGISTER" 7 'cost and retention' '## Records'
for subject in 'Neon developer, CI, and temporary recovery branches' 'S3 media objects and noncurrent versions' 'ECR image storage and scan artifacts' 'Lightsail instance, static IP, attached state, and snapshots' 'Logs, metrics, alerts, and retained operational records' 'Acceptance evidence, reports, SBOMs, and scan artifacts'; do
  require_regex "$COST_REGISTER" "^\\|[^|]*${subject}[^|]*\\|" "cost subject ${subject}"
done
for column in 'Monthly planning estimate (USD)' 'Cost basis and uncertainty' 'Deletion policy' 'Retention / expiry policy' 'Review owner and cadence' 'Decision state'; do
  require_text "$COST_REGISTER" "$column" "cost $column column"
done
require_regex "$COST_REGISTER" 'planning envelope is \*\*USD [0-9]+–[0-9]+ per month\*\*' 'total monthly planning envelope'
require_decision_column "$COST_REGISTER" 'cost and retention' 7
for word in deletion retention expiry review; do
  require_regex "$COST_REGISTER" "(?i)${word}" "${word} policy"
done

# F00-T02-R04: the policy names stable branch protections, reachability and
# review rules, all stable checks, and approval ownership for every tag class.
check_table "$POLICY" 4 'branch rules' '## Branch creation and update rules'
check_table "$POLICY" 2 'stable required checks' '## Stable required checks'
check_table "$POLICY" 4 'semantic deployment-tag rules' '## Semantic deployment-tag rules'
for branch in development main; do
  require_text "$POLICY" "\`${branch}\` branch" "protected branch ${branch}"
done
for check in policy install typecheck unit-schema migration integration build container-smoke security-scans; do
  require_text "$POLICY" "\`${check}\`" "stable required check ${check}"
done
for tag in 'vMAJOR.MINOR.PATCH-dev.N' 'vMAJOR.MINOR.PATCH-rc.N' 'vMAJOR.MINOR.PATCH'; do
  require_text "$POLICY" "\`${tag}\`" "semantic tag ${tag}"
done
require_text "$POLICY" 'reachable from `development`' 'development tag reachability rule'
require_text "$POLICY" 'reachable from `main`' 'release tag reachability rule'
require_text "$POLICY" 'no direct push' 'protected branch review rule'
require_text "$POLICY" 'all stable checks must pass' 'required-check gate'
require_text "$POLICY" 'unapproved, unreachable, or branch-only' 'rejection rule'
require_text "$POLICY" 'Development deployment approver (Engineering)' 'development tag approval ownership'
require_text "$POLICY" 'Staging deployment approver (Engineering and Product)' 'staging tag approval ownership'
require_text "$POLICY" 'Production deployment approver (Product, Engineering, and Security)' 'production tag approval ownership'
require_text "$POLICY" 'no branch push deploys' 'branch non-deployment rule'
require_text "$POLICY" 'no mutable `latest` tag' 'mutable latest prohibition'
require_text "$POLICY" 'external GitHub owners to approve' 'external enforcement boundary'

# F00-T02-R06: assert every separation dimension, including synthetic default
# data, in the environment register and the inventory's scope rule.
for separation in Credentials Roles Databases 'Media buckets' 'Search keys' 'Application secrets' 'Default data'; do
  require_row "$ENV_REGISTER" "$separation" "separation boundary ${separation}"
done
require_text "$ENV_REGISTER" 'Production is a separate Neon project' 'production database separation'
require_text "$ENV_REGISTER" 'Production and non-production credentials are different' 'credential separation'
require_text "$ENV_REGISTER" 'Production, staging, development, and local/test media stores are separate' 'media separation'
require_text "$ENV_REGISTER" 'Production, staging, development, and local/test media stores are separate' 'media separation'
require_text "$ENV_REGISTER" 'production master key is never non-production input' 'search-key separation'
require_text "$ENV_REGISTER" 'production data is never seeded into non-production' 'default-data separation'

# Guarded decisions are never silently defaulted. The register tables use an
# explicit Approved/Blocked state, and the policy's blocked state has no fake
# approver or date. Any future Approved policy must carry both fields.
if rg -n '(^|[[:space:]])(TBD|TODO|pending|not recorded|not supplied)([[:space:]]|$)' -i "$REG_DIR" "$POLICY" >/dev/null; then
  fail 'registers contain an unresolved placeholder or silent pending decision'
fi
require_frontmatter "$POLICY" decision_state 'Blocked' 'guarded decision state'
require_text "$POLICY" 'external GitHub owners to approve' 'blocked external approval gate'
if frontmatter "$POLICY" | rg -q '^status:[[:space:]]*Approved$'; then
  require_frontmatter "$POLICY" approver '[^N][^o][^n][e].+' 'named policy approver'
  require_frontmatter "$POLICY" approved_at '[0-9]{4}-[0-9]{2}-[0-9]{2}' 'policy approval date'
fi

# Credential-shaped values are prohibited in all versioned register/policy
# documents. Names and handling metadata above are allowed; values are not.
if rg -nU 'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@|(^|[^A-Za-z0-9_])Bearer[[:space:]]+[A-Za-z0-9._~+/=-]{16,}|(^|[^A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{20,}|(^|[^A-Za-z0-9_])sk-[A-Za-z0-9]{20,}' "$REG_DIR" "$POLICY" >/dev/null; then
  fail 'register or policy contains a credential-shaped value'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F00-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F00-T02 acceptance: all project register and policy checks passed\n'
