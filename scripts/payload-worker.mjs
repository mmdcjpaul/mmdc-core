#!/usr/bin/env node

const value = (name, fallback) => process.env[name]?.trim() || fallback;
const once = process.argv.includes('--once');
const pollMs = Math.min(10_000, Math.max(25, Number(value('MMDC_WORKER_POLL_MS', '250')) || 250));
const leaseMs = Math.min(120_000, Math.max(500, Number(value('MMDC_WORKER_LEASE_MS', '5000')) || 5000));
const batchSize = Math.min(10, Math.max(1, Number(value('MMDC_WORKER_BATCH_SIZE', '1')) || 1));

if (process.argv.includes('--help')) {
  console.log('Payload worker: pnpm run worker [-- --once]');
  console.log('MMDC_WORKER_POLL_MS, MMDC_WORKER_LEASE_MS, and MMDC_WORKER_BATCH_SIZE are bounded runtime settings.');
  process.exit(0);
}

const [{ default: config }, { getPayload }] = await Promise.all([import('../payload.config.ts'), import('payload')]);

const log = (event, fields = {}) => console.log(JSON.stringify({ event, service: 'payload-worker', ...fields }));
const payload = await getPayload({ config });
let stopping = false;

const reclaimExpiredLeases = async () => {
  const cutoff = new Date(Date.now() - leaseMs).toISOString();
  const result = await payload.update({
    collection: 'payload-jobs',
    where: {
      and: [{ processing: { equals: true } }, { updatedAt: { less_than: cutoff } }]
    },
    data: { processing: false },
    limit: batchSize,
    depth: 0,
    overrideAccess: true,
    disableTransaction: true
  });
  const reclaimed = Array.isArray(result?.docs) ? result.docs.length : 0;
  if (reclaimed) log('worker.lease_recovered', { reclaimed, leaseMs });
};

const runBatch = async () => {
  await reclaimExpiredLeases();
  const result = await payload.jobs.run({
    limit: batchSize,
    sequential: true,
    overrideAccess: true,
    silent: { info: true }
  });
  const statuses = Object.values(result?.jobStatus ?? {});
  const retryable = statuses.filter((status) => status?.status === 'error').length;
  log('worker.batch', { jobs: statuses.length, retryable, remaining: result?.remainingJobsFromQueried ?? 0 });
  return statuses.length;
};

const stop = () => {
  stopping = true;
  log('worker.stop_requested');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  log('worker.started', { pollMs, leaseMs, batchSize, mode: once ? 'once' : 'continuous' });
  do {
    const jobs = await runBatch();
    if (once || stopping) break;
    if (!jobs) await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (!stopping);
  log('worker.stopped');
} finally {
  await payload.destroy();
}
