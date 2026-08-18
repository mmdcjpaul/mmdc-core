#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0

fail() {
  printf 'F09-T03 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

cd "$ROOT"
for command in node pnpm rg bash; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
for file in scripts/deployment-evidence-verifier.mjs tests/acceptance/F09-T03-probe.mjs; do
  [ -f "$file" ] || fail "missing F09-T03 artifact: $file"
done
[ -x tests/acceptance/F09-T03.sh ] || fail 'F09-T03 acceptance script must be executable'
[ "$errors" -eq 0 ] || exit 1

# This is a repository-only harness. It deliberately does not create a tag,
# invoke GitHub, publish ECR/S3, use SSH, contact Neon, or mutate AWS/Lightsail.
run_check 'runtime policy' pnpm run check:runtime
run_check 'repository policy' pnpm run check:policy
run_check 'F09-T03 deterministic verifier probe' node tests/acceptance/F09-T03-probe.mjs
run_check 'F09-T03 verifier syntax' node --check scripts/deployment-evidence-verifier.mjs
run_check 'F09-T03 probe syntax' node --check tests/acceptance/F09-T03-probe.mjs
run_check 'F09-T03 formatting' pnpm exec prettier --check scripts/deployment-evidence-verifier.mjs tests/acceptance/F09-T03-probe.mjs docs/runbooks/deployment-acceptance.md docs/evidence/F09-T03-deployment-acceptance.template.json docs/evidence/F09-T03-deployment-acceptance.md

if rg -n 'aws\s+(?:s3|ecr|cloudformation|lightsail)|ssh\s+|scp\s+|docker\s+push|git\s+push' \
  tests/acceptance/F09-T03.sh tests/acceptance/F09-T03-probe.mjs scripts/deployment-evidence-verifier.mjs; then
  fail 'F09-T03 local proof contains an external mutation or SSH command'
fi

# A real release record may be supplied by an authorized operator without
# changing this repository. Missing or synthetic external evidence is a hard
# blocker; the synthetic probe above is never promoted to Done evidence.
authentic_evidence="${MMDC_F09_T03_AUTHENTIC_EVIDENCE:-$ROOT/docs/evidence/F09-T03-deployment-acceptance.json}"
if [ ! -f "$authentic_evidence" ]; then
  printf 'F09-T03 acceptance: BLOCKED — authentic external deployment evidence is missing\n' >&2
  printf 'F09-T03 acceptance: provide a retained JSON record at %s after an approved development tag/release; do not use the synthetic fixture\n' "$authentic_evidence" >&2
  exit 1
fi
if ! node scripts/deployment-evidence-verifier.mjs verify --input "$authentic_evidence" --require-authentic; then
  fail 'authentic external deployment evidence failed the fail-closed verifier'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F09-T03 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F09-T03 acceptance: authentic deployment evidence reconciled and all deterministic rejection/recovery paths passed\n'
