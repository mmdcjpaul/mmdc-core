#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/ci.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const ciJobs = readFileSync(path.join(root, 'scripts/ci-jobs.mjs'), 'utf8');
const stableJobs = [
  'policy',
  'install',
  'typecheck',
  'unit-schema',
  'migration',
  'integration',
  'build',
  'container-smoke',
  'security-scans'
];
const failures = [];

const fail = (message) => failures.push(message);

const run = (arguments_, environment = process.env) =>
  spawnSync(process.execPath, arguments_, {
    cwd: root,
    env: { ...environment, CI: 'true' },
    encoding: 'utf8',
    stdio: 'pipe'
  });

const lintWorkflow = () => {
  const yaml = spawnSync('ruby', ['-e', 'require "yaml"; YAML.load_file(ARGV.fetch(0))', workflowPath], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  if (yaml.status !== 0) fail(`workflow YAML parser failed: ${yaml.stderr.trim()}`);

  if (!/^on:\s*$/m.test(workflow) || !/^\s+pull_request:\s*$/m.test(workflow)) {
    fail('workflow must trigger on pull requests');
  }
  if (!/^\s+push:\s*$/m.test(workflow) || !/      - development\n      - main/.test(workflow)) {
    fail('workflow must trigger on development and main protected-branch changes');
  }
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(workflow)) {
    fail('workflow must declare least-privilege read-only contents permission');
  }

  for (const job of stableJobs) {
    const declaration = new RegExp(`^  ${job.replace('-', '\\-')}:\\s*$`, 'm');
    const name = new RegExp(`^    name: ${job.replace('-', '\\-')}\\s*$`, 'm');
    if (!declaration.test(workflow) || !name.test(workflow)) fail(`stable job ${job} is missing or renamed`);
    if (!new RegExp(`pnpm run ci:${job.replace('-', '\\-')}`).test(workflow)) {
      fail(`stable job ${job} does not invoke its repository CI command`);
    }
  }
  for (const image of ['postgres:17', 'getmeili/meilisearch:v1.51.0']) {
    if (!workflow.includes(`image: ${image}`)) fail(`workflow is missing disposable service ${image}`);
  }
  const integrationStart = workflow.indexOf('  integration:');
  const relativeNextIntegrationJob = workflow.slice(integrationStart + 3).search(/\n  [a-z][a-z-]*:\n/);
  const integrationEnd = relativeNextIntegrationJob < 0 ? -1 : integrationStart + 3 + relativeNextIntegrationJob;
  const integrationJob = workflow.slice(integrationStart, integrationEnd < 0 ? workflow.length : integrationEnd);
  if (!integrationJob.includes('expiresAt'))
    fail('integration Meilisearch disposable keys must have a bounded expiration');
  if (!integrationJob.includes('Date.now() + 10 * 60 * 1000'))
    fail('integration Meilisearch disposable keys must expire within the test window');
  const f06 = readFileSync(path.join(root, 'tests/acceptance/F06-T02.sh'), 'utf8');
  if (/(^|[|;&()\s])rg(?:[|;&()\s]|$)/m.test(f06))
    fail('container smoke must use commands available on the GitHub runner');
  if (!f06.includes('for command in docker node pnpm grep curl; do'))
    fail('container smoke must preflight grep for portable predicates');
  if (f06.includes('docker scout sbom'))
    fail('container smoke must not depend on an unpinned Docker Scout SBOM command');
  if (!f06.includes("scanner_image='aquasec/trivy:0.56.2'"))
    fail('container smoke must use the approved fixed-version Trivy scanner');
  if (!f06.includes('--user "$scanner_user"') || !f06.includes('--cache-dir /trivy-cache'))
    fail('container SBOM and scan commands must use the runner UID and explicit isolated cache path');
  if (f06.includes('--volume "$evidence_root/trivy-cache:'))
    fail('container smoke must not place the Trivy cache in retained evidence');
  if (!f06.includes('application-image.sbom.spdx.json')) fail('container smoke must retain an SPDX SBOM');
  if (!ciJobs.includes("['install', '--frozen-lockfile']")) {
    fail('repository CI install command does not use frozen dependency installation');
  }
  if (workflow.includes('continue-on-error: true')) fail('CI failure propagation is weakened by continue-on-error');
  if (workflow.includes('secrets.') || /\bAWS_(ACCESS|SECRET|SESSION)|\bNEON_(API|DATABASE)/.test(workflow)) {
    fail('workflow references hosted credentials or environment secrets');
  }
  if (!workflow.includes('cancel-in-progress: false'))
    fail('migration/container jobs must not be cancellable in progress');
  if (!workflow.includes('actions/upload-artifact@v4')) fail('quality evidence artifact retention is missing');
  const securityStart = workflow.indexOf('  security-scans:');
  const securityEnd = securityStart < 0 ? -1 : workflow.slice(securityStart + 3).search(/\n  [a-z][a-z-]*:\n/);
  const securityJob =
    securityStart < 0
      ? ''
      : workflow.slice(securityStart, securityEnd < 0 ? workflow.length : securityStart + 3 + securityEnd);
  if (!securityJob.includes('if: always()'))
    fail('security scans must run to retain a blocking missing-evidence report');

  if ((f06.match(/docker build --pull --tag/g) ?? []).length !== 1) {
    fail('container smoke must build the production image exactly once');
  }
};

const simulateJobs = () => {
  for (const job of stableJobs) {
    const description = run(['scripts/ci-jobs.mjs', 'describe', job]);
    if (description.status !== 0) {
      fail(`local simulation could not resolve stable job ${job}: ${description.stderr.trim()}`);
      continue;
    }
    const parsed = JSON.parse(description.stdout);
    if (parsed.job !== job || !Array.isArray(parsed.commands) || parsed.commands.length === 0) {
      fail(`local simulation for ${job} has no executable command contract`);
    }
  }
};

const assertBlocking = (job, fault) => {
  const result = run(['scripts/ci-jobs.mjs', job], { ...process.env, CI_FAILURE_INJECTION: fault });
  if (result.status === 0) fail(`injected ${fault} did not block stable job ${job}`);
};

const simulateFailures = () => {
  for (const job of ['policy', 'typecheck']) assertBlocking(job, 'stale-generated-type');
  assertBlocking('policy', 'payload-pin');
  assertBlocking('migration', 'migration');
  assertBlocking('container-smoke', 'image-health');
};

const action = process.argv[2] ?? 'all';
if (action === 'lint' || action === 'all') lintWorkflow();
if (action === 'simulate' || action === 'all') {
  simulateJobs();
  simulateFailures();
}

if (!['lint', 'simulate', 'all'].includes(action)) fail(`unknown harness action: ${action}`);
if (failures.length) {
  for (const failure of failures) console.error(`CI workflow harness: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `CI workflow harness passed: linted ${stableJobs.length} stable jobs, simulated all jobs, and observed all injected blocking failures`
  );
}
