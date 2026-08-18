#!/usr/bin/env bash
set -uo pipefail

export CI=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
probe_root="$(mktemp -d "${TMPDIR:-/tmp}/mmdc-f07-t02.XXXXXX")"
errors=0

cleanup() {
  rm -rf "$probe_root"
}
trap cleanup EXIT

fail() {
  printf 'F07-T02 acceptance: %s\n' "$*" >&2
  errors=$((errors + 1))
}

run_check() {
  local description="$1"
  shift
  if ! "$@"; then fail "$description failed"; fi
}

expect_blocking_scan() {
  local scan_name="$1"
  local report_dir="$probe_root/$scan_name"
  mkdir -p "$report_dir"
  if CI_SECURITY_OFFLINE=1 CI_FAILURE_INJECTION="$scan_name" CI_SECURITY_ARTIFACT_DIR="$report_dir" \
    pnpm run ci:security-scans >"$report_dir/job.log" 2>&1; then
    fail "injected $scan_name did not block the security-scans job"
  fi
  if ! node --input-type=module - "$report_dir" "$scan_name" <<'NODE'
import { readFileSync } from 'node:fs';
import process from 'node:process';

const [reportDirectory, scanName] = process.argv.slice(2);
const summary = JSON.parse(readFileSync(`${reportDirectory}/scan-summary.json`, 'utf8'));
const report = JSON.parse(readFileSync(`${reportDirectory}/${scanName}.json`, 'utf8'));
if (summary.status !== 'failed' || report.status !== 'failed') process.exit(1);
if (JSON.stringify(summary).includes('protected-value') || JSON.stringify(report).includes('protected-value')) process.exit(1);
NODE
  then
    fail "injected $scan_name did not retain a sanitized blocking report"
  fi
}

cd "$ROOT"
for command in node pnpm ruby rg git; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[ "$errors" -eq 0 ] || exit 1

# This policy command parses the workflow, reconciles the exact stable checks
# with the branch policy, and checks retention/evidence coverage. It is not a
# file-existence probe: it evaluates the workflow's job, permission,
# concurrency, cache, artifact, and scan semantics.
run_check 'workflow security policy and branch-check reconciliation' \
  node scripts/ci-security-gates.mjs policy

# The existing local workflow harness proves the F07-T01 job contract remains
# intact while this ticket changes its security and evidence envelope.
run_check 'stable workflow job and failure-propagation harness' \
  node scripts/ci-workflow-harness.mjs lint

run_check 'fork-event credential isolation simulation' \
  node scripts/ci-security-gates.mjs fork-simulation

run_check 'credential-shaped log and artifact sanitization' \
  env CI_SECURITY_ARTIFACT_DIR="$probe_root/sanitization" node scripts/ci-security-gates.mjs sanitization

# Run the production security-gate command in deterministic offline mode. The
# GitHub workflow omits this test-only switch and runs the real dependency
# triage command; offline mode only removes network variance from acceptance.
run_check 'security scan coverage and sanitized report generation' \
  env CI_SECURITY_OFFLINE=1 CI_SECURITY_ARTIFACT_DIR="$probe_root/passing" pnpm run ci:security-scans

for scan_name in secret-scan dependency-scan license-scan iac-scan container-scan; do
  expect_blocking_scan "$scan_name"
done

if [ "$errors" -ne 0 ]; then
  printf 'F07-T02 acceptance: %s check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'F07-T02 acceptance: permissions, fork isolation, safe cache/concurrency, durable scan evidence, injected scan gates, sanitization, and exact branch checks passed\n'
