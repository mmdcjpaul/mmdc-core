import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

import config from '../../payload.config.ts';
import { getPayload } from 'payload';

const databasePath = process.env.F04_WORKER_DATABASE;
const markerPath = process.env.F04_WORKER_MARKER;
const root = process.cwd();
assert.ok(databasePath && markerPath);
rmSync(databasePath.replace(/^file:/, ''), { force: true });
rmSync(markerPath, { force: true });

const runtimeEnvironment = {
  ...process.env,
  MMDC_COMPATIBILITY_DATABASE: databasePath,
  DATABASE_URL: 'postgresql://mmdc@127.0.0.1:1/mmdc_local',
  DATABASE_DIRECT_URL: 'postgresql://mmdc@127.0.0.1:1/mmdc_local',
  PAYLOAD_SECRET: 'F04-T01-worker-runtime-secret',
  MMDC_WORKER_PROBE_FILE: markerPath,
  MMDC_WORKER_LEASE_MS: '500',
  MMDC_WORKER_POLL_MS: '25',
  MMDC_WORKER_BATCH_SIZE: '1'
};

const payload = await getPayload({ config });
const runWorker = (signalAfterStart = false) => {
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/payload-worker.mjs', '--once'], {
    cwd: root,
    env: runtimeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  return {
    child,
    get output() {
      return output;
    },
    signalAfterStart
  };
};

const waitFor = async (predicate, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('worker probe timed out');
};

const interruptedJob = await payload.jobs.queue({
  task: 'foundation-search-probe',
  input: { marker: 'interrupted-once', durationMs: 2_000 },
  overrideAccess: true
});
const interrupted = runWorker();
await waitFor(async () => {
  const result = await payload.find({
    collection: 'payload-jobs',
    where: { and: [{ id: { equals: interruptedJob.id } }, { processing: { equals: true } }] },
    limit: 1,
    overrideAccess: true
  });
  return result.totalDocs === 1;
});
interrupted.child.kill('SIGKILL');
await new Promise((resolve) => interrupted.child.once('exit', resolve));
await new Promise((resolve) => setTimeout(resolve, 700));
const recovered = runWorker();
const recoveredExit = await new Promise((resolve) => recovered.child.once('exit', (code) => resolve(code)));
assert.equal(recoveredExit, 0, recovered.output);
assert.match(recovered.output, /worker\.lease_recovered/);

const retryJob = await payload.jobs.queue({
  task: 'foundation-search-probe',
  input: { marker: 'bounded-retry', failUntilAttempt: 1 },
  overrideAccess: true
});
const retryFirst = runWorker();
const retryFirstExit = await new Promise((resolve) => retryFirst.child.once('exit', (code) => resolve(code)));
assert.equal(retryFirstExit, 0, retryFirst.output);
await new Promise((resolve) => setTimeout(resolve, 150));
const retrySecond = runWorker();
const retrySecondExit = await new Promise((resolve) => retrySecond.child.once('exit', (code) => resolve(code)));
assert.equal(retrySecondExit, 0, retrySecond.output);

const jobs = await payload.find({
  collection: 'payload-jobs',
  where: { id: { in: [interruptedJob.id, retryJob.id] } },
  limit: 10,
  overrideAccess: true
});
const recoveredJob = jobs.docs.find((job) => job.id === interruptedJob.id);
const completedRetryJob = jobs.docs.find((job) => job.id === retryJob.id);
assert.equal(recoveredJob?.processing, false);
assert.ok(recoveredJob?.completedAt);
assert.equal(completedRetryJob?.processing, false);
assert.equal(completedRetryJob?.hasError, false);
assert.equal(completedRetryJob?.totalTried, 2);
assert.ok(completedRetryJob?.log?.length >= 2);

const markers = existsSync(markerPath)
  ? readFileSync(markerPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : [];
assert.deepEqual(
  markers.map(({ marker, attempt }) => ({ marker, attempt })),
  [
    { marker: 'interrupted-once', attempt: 1 },
    { marker: 'bounded-retry', attempt: 2 }
  ]
);
await payload.destroy();
console.log(
  'F04-T01 worker probe: forced interruption reclaimed a bounded lease and retry completed exactly once with observable job state'
);
