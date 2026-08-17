#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
errors=0

fail() {
  printf 'F02-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then
    fail "$description failed"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

cd "$ROOT"
for command in node pnpm rg; do require_command "$command"; done

run_check 'runtime policy' pnpm run check:runtime
run_check 'scaffold policy' pnpm run check:policy
run_check 'format check' pnpm run format:check
run_check 'unit and guard tests' pnpm run test
run_check 'typecheck' pnpm run typecheck
run_check 'lint' pnpm run lint
run_check 'Neon compatibility contract matrix' pnpm run test:neon
run_check 'F02-T02 behavioral probe' node --import tsx tests/acceptance/F02-T02-probe.mjs

bootstrap_help="$(pnpm run bootstrap -- --help 2>&1 || true)"
if ! printf '%s' "$bootstrap_help" | rg -Fq 'One-time interactive bootstrap'; then
  fail 'bootstrap command does not expose the documented one-time path'
fi
if printf '%s' "$bootstrap_help" | rg -q 'postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@|acceptance-only-in-memory-value'; then
  fail 'bootstrap help output contains a credential-shaped value'
fi

guard_output="$(env MMDC_ENVIRONMENT=development PAYLOAD_SECRET='F02-T02-guard-sentinel' DATABASE_URL='postgresql://127.0.0.1:1/mmdc' DATABASE_DIRECT_URL='postgresql://127.0.0.1:1/mmdc' pnpm run seed 2>&1 || true)"
if printf '%s' "$guard_output" | rg -q 'Synthetic seed completed'; then
  fail 'development seed was allowed without break-glass approval'
fi
if printf '%s' "$guard_output" | rg -Fq 'F02-T02-guard-sentinel'; then
  fail 'seed refusal leaked a server secret sentinel'
fi

plan_output="$(DATABASE_DIRECT_URL='postgresql://migration@ep-mmdc.ap-southeast-1.aws.neon.tech/mmdc?sslmode=require' NEON_RECOVERY_LIVE_URL='postgresql://migration@ep-mmdc.ap-southeast-1.aws.neon.tech/mmdc?sslmode=require' NEON_RECOVERY_TEMPORARY_URL='postgresql://migration@ep-mmdc-recovery.ap-southeast-1.aws.neon.tech/mmdc?sslmode=require' node --import tsx scripts/neon-recovery.mjs plan 2>&1 || true)"
if ! printf '%s' "$plan_output" | rg -Fq '<direct-url>'; then
  fail 'recovery plan did not redact administrative connection output'
fi
if printf '%s' "$plan_output" | rg -q 'postgres(ql)?://'; then
  fail 'recovery plan emitted a connection URL'
fi

for path in docs/runbooks/neon-operations.md docs/runbooks/neon-recovery.md docs/evidence/F02-T02-neon-operations.md; do
  [ -f "$path" ] || fail "missing operational evidence/runbook: $path"
done
for term in 'DATABASE_URL' 'DATABASE_DIRECT_URL' 'restore window' 'pre-migration' 'logical backup' 'retention' 'temporary' 'validate' 'cutover' 'approver' 'environment'; do
  if ! rg -qi "$term" docs/runbooks/neon-operations.md docs/runbooks/neon-recovery.md docs/evidence/F02-T02-neon-operations.md; then
    fail "operational documentation is missing: $term"
  fi
done
if ! rg -Fq 'no external Neon rehearsal claimed' docs/evidence/F02-T02-neon-operations.md; then
  fail 'evidence record does not explicitly distinguish repository tests from external evidence'
fi
if rg -nU 'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@|(^|[^A-Za-z0-9_])Bearer[[:space:]]+[A-Za-z0-9._~+/=-]{16,}|(^|[^A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{20,}|(^|[^A-Za-z0-9_])sk-[A-Za-z0-9]{20,}' scripts/payload-bootstrap.mjs scripts/payload-seed.mjs scripts/neon-recovery.mjs src/operations docs/runbooks docs/evidence >/dev/null; then
  fail 'F02-T02 implementation or evidence contains a credential-shaped value'
fi
if rg -n 'pg_dump.*DATABASE_URL|DATABASE_URL.*pg_dump|pg_restore.*DATABASE_URL|DATABASE_URL.*pg_restore' scripts src docs/runbooks >/dev/null; then
  fail 'recovery tooling references pooled DATABASE_URL for backup or restore'
fi

if [ "$errors" -ne 0 ]; then
  printf 'F02-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F02-T02 acceptance: bootstrap, synthetic seed guards, Neon URL roles, compatibility matrix, recovery isolation, and sanitized runbooks passed\n'
