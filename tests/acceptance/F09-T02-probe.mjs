import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildDesiredState } from '../../scripts/release-publication.mjs';

const root = process.cwd();
const agent = path.join(root, 'infrastructure/host/mmdc-pull-agent.sh');
const productionCompose = readFileSync(path.join(root, 'infrastructure/compose/production.yml'), 'utf8');
assert.match(productionCompose, /command:\s*\['web'\]/);
assert.match(productionCompose, /command:\s*\['worker'\]/);
assert.doesNotMatch(productionCompose, /command:[^\n]*migrat/i);
assert.doesNotMatch(productionCompose, /migrat(e|ion).*startup/i);

const temp = execFileSync('mktemp', ['-d', path.join(os.tmpdir(), 'mmdc-f09-t02.XXXXXX')], { encoding: 'utf8' }).trim();
const deploymentRoot = path.join(temp, 'deployment');
const readyDir = path.join(temp, 'ready');
const actionLog = path.join(temp, 'actions.log');
const migrationCount = path.join(temp, 'migration.count');
const config = path.join(temp, 'pull-agent.env');
const runtimeEnv = path.join(temp, 'runtime.env');
const composeDir = path.join(temp, 'compose');
mkdirSync(readyDir, { recursive: true });
mkdirSync(composeDir, { recursive: true });
for (const name of ['neon', 's3', 'meilisearch', 'health', 'route', 'admin', 'database', 'search', 'media'])
  writeFileSync(path.join(readyDir, `${name}.ready`), 'ready\n');
writeFileSync(actionLog, '');
writeFileSync(runtimeEnv, 'DATABASE_DIRECT_URL=synthetic-direct-url\n', { mode: 0o600 });
writeFileSync(path.join(composeDir, 'shared.yml'), 'services: {}\n');
writeFileSync(path.join(composeDir, 'production.yml'), productionCompose);
writeFileSync(path.join(composeDir, 'Caddyfile'), ':80 { respond /health 200 }\n');
writeFileSync(
  config,
  [
    'MMDC_DEPLOYMENT_ENVIRONMENT=development',
    'MMDC_PULL_AGENT_PROBE_MODE=fixture',
    `MMDC_DEPLOYMENT_ROOT=${deploymentRoot}`,
    `MMDC_STATUS_DIR=${path.join(deploymentRoot, 'status')}`,
    `MMDC_FIXTURE_READY_DIR=${readyDir}`,
    `MMDC_FIXTURE_ACTION_LOG=${actionLog}`,
    `MMDC_FIXTURE_MIGRATION_COUNT_FILE=${migrationCount}`
  ].join('\n') + '\n'
);
chmodSync(config, 0o600);

const hexDigit = (digit) => 'abcdef'[(digit - 1) % 6];
const sha = (digit) => hexDigit(digit).repeat(40);
const digest = (digit) => `sha256:${hexDigit(digit).repeat(64)}`;
const workflow = (tag, runId) => ({
  eventName: 'push',
  ref: `refs/tags/${tag}`,
  refType: 'tag',
  workflowRef: 'mmdcjpaul/mmdc-core/.github/workflows/release.yml@refs/heads/development',
  runId,
  actor: 'f09-t02-harness'
});
const makeState = (dev, compatibility = 'compatible') => {
  const tag = `v1.0.0-dev.${dev}`;
  return buildDesiredState({
    repository: 'synthetic.invalid/mmdc-v3-development',
    tag,
    gitSha: sha(dev),
    digest: digest(dev),
    migrationVersion: `20260818_00000${dev}_synthetic`,
    compatibility,
    evidence: { sbomSha256: 'a'.repeat(64), provenanceSha256: 'b'.repeat(64), publicationSha256: 'c'.repeat(64) },
    workflow: workflow(tag, `f09-t02-${dev}`),
    issuedAt: `2026-08-18T00:0${dev}:00.000Z`
  });
};
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const stateFile = (name) => path.join(temp, `${name}.json`);
const currentFile = path.join(deploymentRoot, 'current.json');
const recoveryFile = path.join(deploymentRoot, 'recovery.json');
mkdirSync(deploymentRoot, { recursive: true });
writeJson(recoveryFile, {
  status: 'ready',
  environment: 'development',
  migrationVersion: '20260818_000001_synthetic',
  recoveryPointId: 'synthetic-restore-point-1',
  logicalBackupPath: '/synthetic/recovery/f09-t02.dump',
  capturedAt: '2026-08-18T00:00:00.000Z'
});

const run = (state, extra = {}) => {
  const file = stateFile(`state-${state.release.tag.replaceAll('.', '-')}`);
  writeJson(file, state);
  const result = spawnSync(agent, ['--reconcile', file], {
    cwd: root,
    env: {
      ...process.env,
      MMDC_PULL_AGENT_CONFIG: config,
      MMDC_RUNTIME_ENV_FILE: runtimeEnv,
      MMDC_PRE_MIGRATION_RECOVERY_EVIDENCE: recoveryFile,
      ...extra
    },
    encoding: 'utf8'
  });
  return { file, result };
};
const resetFixtureMigrationCount = () => writeFileSync(migrationCount, '0\n');

const first = makeState(1);
const second = makeState(2);
writeJson(currentFile, first);
writeJson(recoveryFile, {
  ...JSON.parse(readFileSync(recoveryFile, 'utf8')),
  migrationVersion: second.migration.version
});
let outcome = run(second);
assert.equal(outcome.result.status, 0, `${outcome.result.stdout}\n${outcome.result.stderr}`);
assert.equal(JSON.parse(readFileSync(currentFile, 'utf8')).release.tag, second.release.tag);
assert.deepEqual(
  readFileSync(actionLog, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split(' ')[0]),
  ['pull', 'migrate', 'recreate']
);
assert.equal(readFileSync(migrationCount, 'utf8').trim(), '1');
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${second.release.gitSha}.json`), 'utf8')).status,
  'succeeded'
);

outcome = run(second);
assert.equal(outcome.result.status, 0);
assert.equal(readFileSync(actionLog, 'utf8').trim().split('\n').length, 3, 'duplicate must not migrate again');
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${second.release.gitSha}.json`), 'utf8')).status,
  'idempotent'
);

const stale = makeState(1);
outcome = run(stale);
assert.notEqual(outcome.result.status, 0);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${stale.release.gitSha}.json`), 'utf8')).reason,
  'stale-desired-state'
);

const tampered = structuredClone(makeState(3));
tampered.image.digest = `sha256:${'d'.repeat(64)}`;
outcome = run(tampered);
assert.notEqual(outcome.result.status, 0);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${tampered.release.gitSha}.json`), 'utf8')).status,
  'rejected'
);

const wrongEnvironment = structuredClone(makeState(3));
wrongEnvironment.environment = 'production';
outcome = run(wrongEnvironment);
assert.notEqual(outcome.result.status, 0);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${wrongEnvironment.release.gitSha}.json`), 'utf8'))
    .status,
  'rejected'
);

const mutable = structuredClone(makeState(3));
mutable.image.repository = 'synthetic.invalid/mmdc-v3-development:latest';
outcome = run(mutable);
assert.notEqual(outcome.result.status, 0);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${mutable.release.gitSha}.json`), 'utf8')).status,
  'rejected'
);

const third = makeState(3);
resetFixtureMigrationCount();
writeJson(currentFile, second);
writeJson(recoveryFile, {
  ...JSON.parse(readFileSync(recoveryFile, 'utf8')),
  migrationVersion: third.migration.version
});
outcome = run(third, { MMDC_FIXTURE_MIGRATION_RESULT: 'fail' });
assert.notEqual(outcome.result.status, 0);
assert.equal(JSON.parse(readFileSync(currentFile, 'utf8')).release.tag, second.release.tag);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${third.release.gitSha}.json`), 'utf8')).status,
  'migration-failed'
);
assert.equal(
  readFileSync(actionLog, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('recreate')).length,
  1
);
const failedReleaseMigrationInvocations = readFileSync(actionLog, 'utf8')
  .trim()
  .split('\n')
  .filter((line) => line.startsWith('migrate')).length;
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, `migration-${third.release.gitSha}.state.json`), 'utf8')).status,
  'failed'
);
outcome = run(third, { MMDC_FIXTURE_MIGRATION_RESULT: 'ok' });
assert.notEqual(outcome.result.status, 0, 'failed migration redelivery must remain failed/safe');
assert.equal(
  readFileSync(actionLog, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('migrate')).length,
  failedReleaseMigrationInvocations,
  'failed migration redelivery must not invoke migration again'
);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${third.release.gitSha}.json`), 'utf8')).reason,
  'migration-attempt-already-recorded'
);

const fourth = makeState(4);
resetFixtureMigrationCount();
writeJson(currentFile, second);
writeJson(recoveryFile, {
  ...JSON.parse(readFileSync(recoveryFile, 'utf8')),
  migrationVersion: fourth.migration.version
});
outcome = run(fourth, { MMDC_FIXTURE_HEALTH_RESULT: 'fail', MMDC_FIXTURE_ROLLBACK_HEALTH_RESULT: 'ok' });
assert.notEqual(outcome.result.status, 0);
assert.equal(JSON.parse(readFileSync(currentFile, 'utf8')).release.tag, second.release.tag);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${fourth.release.gitSha}.json`), 'utf8')).status,
  'rolled-back'
);

const fifth = makeState(5, 'incompatible');
resetFixtureMigrationCount();
writeJson(currentFile, second);
writeJson(recoveryFile, {
  ...JSON.parse(readFileSync(recoveryFile, 'utf8')),
  migrationVersion: fifth.migration.version
});
outcome = run(fifth, { MMDC_FIXTURE_HEALTH_RESULT: 'fail', MMDC_FIXTURE_ROLLBACK_HEALTH_RESULT: 'ok' });
assert.notEqual(outcome.result.status, 0);
assert.equal(JSON.parse(readFileSync(currentFile, 'utf8')).release.tag, second.release.tag);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${fifth.release.gitSha}.json`), 'utf8')).status,
  'safe-state'
);

const sixth = makeState(6);
resetFixtureMigrationCount();
writeJson(currentFile, fifth);
writeJson(recoveryFile, {
  ...JSON.parse(readFileSync(recoveryFile, 'utf8')),
  migrationVersion: sixth.migration.version
});
writeFileSync(actionLog, '');
const fileSix = stateFile('concurrent-six');
writeJson(fileSix, sixth);
const firstProcess = spawn(agent, ['--reconcile', fileSix], {
  cwd: root,
  env: {
    ...process.env,
    MMDC_PULL_AGENT_CONFIG: config,
    MMDC_RUNTIME_ENV_FILE: runtimeEnv,
    MMDC_PRE_MIGRATION_RECOVERY_EVIDENCE: recoveryFile,
    MMDC_FIXTURE_MIGRATION_SLEEP: '0.2'
  },
  stdio: 'ignore'
});
for (let attempt = 0; attempt < 100 && !readFileSync(actionLog, 'utf8').includes('migrate '); attempt += 1) {
  execFileSync('sleep', ['0.01']);
}
const secondProcess = spawnSync(agent, ['--reconcile', fileSix], {
  cwd: root,
  env: {
    ...process.env,
    MMDC_PULL_AGENT_CONFIG: config,
    MMDC_RUNTIME_ENV_FILE: runtimeEnv,
    MMDC_PRE_MIGRATION_RECOVERY_EVIDENCE: recoveryFile
  },
  encoding: 'utf8'
});
await new Promise((resolve) => firstProcess.on('close', resolve));
assert.notEqual(secondProcess.status, 0, 'concurrent delivery must not run in parallel');
assert.equal(
  readFileSync(migrationCount, 'utf8').trim(),
  '1',
  'concurrency must still have one migration for the release'
);

const recoveryMissing = makeState(7);
resetFixtureMigrationCount();
writeJson(currentFile, sixth);
outcome = run(recoveryMissing, { MMDC_PRE_MIGRATION_RECOVERY_EVIDENCE: path.join(temp, 'missing-recovery.json') });
assert.notEqual(outcome.result.status, 0);
assert.equal(
  JSON.parse(readFileSync(path.join(deploymentRoot, 'status', `${recoveryMissing.release.gitSha}.json`), 'utf8'))
    .reason,
  'pre-migration-recovery-evidence-missing'
);

console.log(
  'F09-T02 probe passed integrity/environment/order/mutability rejection, readiness and recovery gates, one-shot direct migration, same-digest service recreation, idempotency, concurrency, compatible rollback, and incompatible-schema safe state'
);
