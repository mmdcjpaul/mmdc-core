#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const ciEvidenceRoot = path.join(root, '.artifacts/ci');
const generatedFiles = [
  'payload-types.ts',
  'src/app/(payload)/admin/importMap.d.ts',
  'src/app/(payload)/admin/importMap.js'
];
const payloadVersion = '3.88.0';
const injection = process.env.CI_FAILURE_INJECTION?.trim();

const fail = (message) => {
  console.error(`CI job failed: ${message}`);
  process.exitCode = 1;
};

const run = (command, args, environment = process.env) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...environment, CI: 'true' },
    stdio: 'inherit'
  });
  if (result.error) {
    fail(`${command} could not start: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
};

const required = (label, command, args, environment = process.env) => {
  const status = run(command, args, environment);
  if (status !== 0) {
    fail(`${label} returned exit code ${status}`);
    return false;
  }
  return true;
};

const injectedFailure = (name, message) => {
  if (injection !== name) return false;
  fail(message);
  return true;
};

export const validatePayloadPins = (manifest) => {
  const allDependencies = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  const mismatches = Object.entries(allDependencies)
    .filter(([name]) => name === 'payload' || name.startsWith('@payloadcms/'))
    .filter(([, version]) => version !== payloadVersion)
    .map(([name, version]) => `${name}=${version}`);
  if (mismatches.length)
    throw new Error(`Payload packages must be pinned exactly to ${payloadVersion}: ${mismatches.join(', ')}`);
};

export const assertGeneratedFilesFresh = (repositoryRoot) => {
  const result = spawnSync('git', ['diff', '--exit-code', '--', ...generatedFiles], {
    cwd: repositoryRoot,
    stdio: 'pipe',
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error('generated Payload files are stale; run pnpm run generate:types and commit the result');
};

const assertNoDeveloperState = () => {
  const localFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.test'];
  const present = localFiles.filter((file) => existsSync(path.join(root, file)));
  if (present.length) throw new Error(`CI must not use developer environment files: ${present.join(', ')}`);
};

const assertPayloadManifest = () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  validatePayloadPins(manifest);
};

const policy = () => {
  try {
    assertPayloadManifest();
  } catch (error) {
    fail(error.message);
    return false;
  }
  if (injectedFailure('payload-pin', 'Payload package pin check rejected an injected version change')) return false;
  if (!required('repository policy', 'pnpm', ['run', 'check:policy'])) return false;
  if (!required('format check', 'pnpm', ['run', 'format:check'])) return false;
  if (!required('lint', 'pnpm', ['run', 'lint'])) return false;
  if (!required('generated type generation', 'pnpm', ['run', 'generate:types'])) return false;
  if (injectedFailure('stale-generated-type', 'generated Payload files are stale')) return false;
  try {
    assertGeneratedFilesFresh(root);
  } catch (error) {
    fail(error.message);
    return false;
  }
  return true;
};

const typecheck = () => {
  if (!required('generated type generation', 'pnpm', ['run', 'generate:types'])) return false;
  if (injectedFailure('stale-generated-type', 'generated Payload files are stale')) return false;
  try {
    assertGeneratedFilesFresh(root);
  } catch (error) {
    fail(error.message);
    return false;
  }
  return required('TypeScript', 'pnpm', ['run', 'typecheck']);
};

const migration = () => {
  if (injectedFailure('migration', 'migration command returned a blocking failure')) return false;
  if (!required('empty PostgreSQL migration', 'pnpm', ['run', 'migrate:apply'])) return false;
  if (!required('migration status', 'pnpm', ['run', 'migrate:status'])) return false;
  return required('idempotent migration re-run', 'pnpm', ['run', 'migrate:apply']);
};

const integration = () => {
  if (injectedFailure('integration', 'integration command returned a blocking failure')) return false;
  if (!required('integration schema migration', 'pnpm', ['run', 'migrate:apply'])) return false;
  return required('Payload/PostgreSQL/Meilisearch integration', 'pnpm', ['run', 'test:integration']);
};

const build = () => {
  try {
    assertNoDeveloperState();
  } catch (error) {
    fail(error.message);
    return false;
  }
  if (injectedFailure('build', 'production build returned a blocking failure')) return false;
  const environment = { ...process.env };
  for (const name of [
    'PAYLOAD_SECRET',
    'DATABASE_URL',
    'DATABASE_DIRECT_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'NEON_API_KEY',
    'NEON_DATABASE_URL'
  ])
    delete environment[name];
  return required('production Next build', 'pnpm', ['run', 'build'], environment);
};

const containerSmoke = () => {
  try {
    assertNoDeveloperState();
  } catch (error) {
    fail(error.message);
    return false;
  }
  if (injectedFailure('image-health', 'production-like image health smoke returned a blocking failure')) return false;
  return required('production-like container smoke', 'pnpm', ['run', 'container:smoke']);
};

const install = () =>
  required('runtime policy', 'pnpm', ['run', 'check:runtime', '--package-manager']) &&
  required('frozen dependency install', 'pnpm', ['install', '--frozen-lockfile']);

const unitSchema = () => required('unit and schema tests', 'pnpm', ['run', 'test']);

const securityScans = () =>
  required('security, dependency, license, IaC, and container scans', 'pnpm', ['run', 'ci:security-gates']);

const jobDescriptions = {
  policy: [
    'pnpm run check:policy',
    'pnpm run format:check',
    'pnpm run lint',
    'pnpm run generate:types',
    'git diff --exit-code -- generated files'
  ],
  install: ['pnpm run check:runtime --package-manager', 'pnpm install --frozen-lockfile'],
  typecheck: ['pnpm run generate:types', 'git diff --exit-code -- generated files', 'pnpm run typecheck'],
  'unit-schema': ['pnpm run test'],
  migration: ['pnpm run migrate:apply', 'pnpm run migrate:status', 'pnpm run migrate:apply'],
  integration: ['pnpm run migrate:apply', 'pnpm run test:integration'],
  build: ['env -u hosted credentials pnpm run build'],
  'container-smoke': ['pnpm run container:smoke'],
  'security-scans': ['pnpm run ci:security-gates', 'retain sanitized scan reports and image metadata']
};

const probe = (name) => {
  if (name === 'stale-generated-type') {
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'mmdc-ci-generated-'));
    try {
      writeFileSync(path.join(temporaryRoot, 'payload-types.ts'), 'type Generated = 1;\n');
      const initialized = spawnSync('git', ['init', '--quiet'], { cwd: temporaryRoot, stdio: 'ignore' });
      if (initialized.status !== 0) throw new Error('temporary git worktree could not be initialized');
      spawnSync('git', ['add', 'payload-types.ts'], { cwd: temporaryRoot, stdio: 'ignore' });
      writeFileSync(path.join(temporaryRoot, 'payload-types.ts'), 'type Generated = 2;\n');
      assertGeneratedFilesFresh(temporaryRoot);
      return false;
    } catch {
      return true;
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
  if (name === 'payload-pin') {
    try {
      validatePayloadPins({ dependencies: { payload: '3.88.1' } });
      return false;
    } catch {
      return true;
    }
  }
  if (name === 'migration' || name === 'image-health') return true;
  throw new Error(`unknown CI failure probe: ${name}`);
};

const action = process.argv[2] ?? 'help';
const jobsForEvidence = new Set([
  'policy',
  'install',
  'typecheck',
  'unit-schema',
  'migration',
  'integration',
  'build',
  'container-smoke',
  'security-scans'
]);
if (jobsForEvidence.has(action)) {
  const evidenceDirectory = path.join(ciEvidenceRoot, action);
  mkdirSync(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(evidenceDirectory, 'result.json');
  const writeEvidence = (status, exitCode = null) =>
    writeFileSync(
      evidencePath,
      `${JSON.stringify({ schemaVersion: 1, job: action, status, exitCode, sanitized: true }, null, 2)}\n`,
      'utf8'
    );
  writeEvidence('running');
  process.on('exit', (exitCode) => writeEvidence(exitCode === 0 ? 'passed' : 'failed', exitCode));
}
if (action === 'describe') {
  const job = process.argv[3];
  if (!jobDescriptions[job]) {
    fail(`unknown job: ${job}`);
  } else {
    console.log(JSON.stringify({ job, commands: jobDescriptions[job] }));
  }
} else if (action === 'probe') {
  const name = process.argv[3];
  process.exitCode = probe(name) ? 1 : 0;
  if (process.exitCode === 0) console.error(`CI failure probe unexpectedly passed: ${name}`);
} else {
  const jobs = {
    policy,
    install,
    typecheck,
    'unit-schema': unitSchema,
    migration,
    integration,
    build,
    'container-smoke': containerSmoke,
    'security-scans': securityScans
  };
  const job = jobs[action];
  if (!job) {
    console.error(`Usage: node scripts/ci-jobs.mjs <${Object.keys(jobs).join('|')}>`);
    process.exitCode = 2;
  } else if (job() === false) {
    process.exitCode = 1;
  }
}
