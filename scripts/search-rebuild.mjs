#!/usr/bin/env node

if (process.argv.includes('--help')) {
  console.log(
    'Search rebuild: reads synthetic canonical records from Neon and atomically swaps the approved versioned index.'
  );
  console.log('Usage: pnpm run search:rebuild');
  process.exit(0);
}

const [{ default: config }, { getPayload }, { createPayloadSearchProjection }] = await Promise.all([
  import('../payload.config.ts'),
  import('payload'),
  import('../src/search/projection.ts')
]);

const payload = await getPayload({ config });
try {
  const result = await createPayloadSearchProjection(payload).rebuild();
  console.log(JSON.stringify({ event: 'search.rebuild.completed', ...result }));
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'search.rebuild.failed',
      message: error instanceof Error ? error.message : 'unknown error'
    })
  );
  process.exitCode = 1;
} finally {
  await payload.destroy();
}
