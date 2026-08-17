#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { assertSeedRequestAllowed, syntheticFixtureName } from '../src/operations/seed-guard.ts';

const action = process.argv[2] === '--reset' ? 'reset' : 'seed';
const environment = (process.env.MMDC_ENVIRONMENT ?? 'local').trim().toLowerCase();

const readApproval = async () => {
  const path = process.env.MMDC_BREAK_GLASS_APPROVAL_FILE;
  if (!path) return undefined;
  try {
    const approval = JSON.parse(await readFile(path, 'utf8'));
    return { guardValue: process.env.MMDC_BREAK_GLASS ?? '', approval };
  } catch {
    throw new Error('break-glass approval file could not be read');
  }
};

const breakGlass = await readApproval();
assertSeedRequestAllowed({
  action,
  environment,
  fixture: syntheticFixtureName,
  breakGlass,
  now: new Date()
});

const { getPayload } = await import('payload');
const { default: config } = await import('../payload.config.ts');
const payload = await getPayload({ config });
try {
  if (action === 'reset') {
    for (const collection of ['media', 'users']) {
      const result = await payload.find({ collection, limit: 1000, overrideAccess: true });
      for (const document of result.docs) {
        await payload.delete({ collection, id: document.id, overrideAccess: true });
      }
    }
  } else {
    await payload.create({
      collection: 'users',
      data: {
        email: `synthetic-${randomBytes(8).toString('hex')}@example.invalid`,
        password: randomBytes(32).toString('base64url'),
        role: 'viewer'
      },
      overrideAccess: true
    });
  }
  console.log(`Synthetic ${action} completed for the ${environment} environment.`);
} finally {
  await payload.destroy();
}
