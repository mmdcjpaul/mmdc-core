import assert from 'node:assert/strict';

import { bootstrapInitialAdministrator } from '../../src/operations/bootstrap.ts';
import {
  DatabaseConnectionContractError,
  validateDatabaseConnection,
  validateDatabasePair
} from '../../src/operations/neon.ts';
import { buildLogicalBackupArguments, buildRestoreArguments } from '../../src/operations/recovery.ts';
import {
  assertSeedRequestAllowed,
  breakGlassGuardValue,
  syntheticFixtureName,
  SeedGuardError
} from '../../src/operations/seed-guard.ts';

const pooled = 'postgresql://runtime@ep-mmdc-pooler.ap-southeast-1.aws.neon.tech/mmdc?sslmode=require';
const direct = 'postgresql://migration@ep-mmdc.ap-southeast-1.aws.neon.tech/mmdc?sslmode=require';
const now = new Date('2026-08-17T12:00:00Z');

validateDatabasePair({ pooledURL: pooled, directURL: direct });
assert.throws(() => validateDatabaseConnection(direct, 'pooled-runtime'), DatabaseConnectionContractError);
assert.throws(() => validateDatabaseConnection(pooled, 'direct-administration'), DatabaseConnectionContractError);
assert.throws(
  () => validateDatabaseConnection(pooled.replace('?sslmode=require', ''), 'pooled-runtime'),
  DatabaseConnectionContractError
);
assert.throws(() => validateDatabasePair({ pooledURL: pooled, directURL: pooled }), DatabaseConnectionContractError);

for (const environment of ['development', 'staging', 'production']) {
  for (const action of ['seed', 'reset']) {
    assert.throws(
      () => assertSeedRequestAllowed({ action, environment, fixture: syntheticFixtureName, now }),
      SeedGuardError
    );
  }
}

const approval = {
  approvalId: 'acceptance-approval',
  approver: 'acceptance fixture approver',
  environment: 'development',
  action: 'seed',
  approvedAt: '2026-08-17T00:00:00Z',
  expiresAt: '2026-08-18T00:00:00Z'
};
assert.doesNotThrow(() =>
  assertSeedRequestAllowed({
    action: 'seed',
    environment: 'development',
    fixture: syntheticFixtureName,
    breakGlass: { guardValue: breakGlassGuardValue, approval },
    now
  })
);
assert.throws(
  () =>
    assertSeedRequestAllowed({
      action: 'seed',
      environment: 'development',
      fixture: syntheticFixtureName,
      breakGlass: { guardValue: breakGlassGuardValue, approval: { ...approval, expiresAt: '2026-08-17T11:00:00Z' } },
      now
    }),
  SeedGuardError
);
assert.throws(
  () =>
    assertSeedRequestAllowed({
      action: 'seed',
      environment: 'development',
      fixture: 'not-a-synthetic-fixture',
      breakGlass: { guardValue: breakGlassGuardValue, approval },
      now
    }),
  SeedGuardError
);

const created = [];
const fakePayload = {
  find: async () => ({ totalDocs: 0 }),
  create: async (args) => {
    created.push(args);
  }
};
const credentialSentinel = 'acceptance-only-in-memory-value';
const originalLog = console.log;
const originalError = console.error;
const output = [];
console.log = (...args) => output.push(args.join(' '));
console.error = (...args) => output.push(args.join(' '));
try {
  await bootstrapInitialAdministrator(fakePayload, { email: 'admin@example.invalid', password: credentialSentinel });
} finally {
  console.log = originalLog;
  console.error = originalError;
}
assert.equal(created.length, 1);
assert.equal(
  output.some((line) => line.includes(credentialSentinel)),
  false
);
await assert.rejects(
  () =>
    bootstrapInitialAdministrator(
      { find: async () => ({ totalDocs: 1 }), create: async () => undefined },
      { email: 'admin@example.invalid', password: credentialSentinel }
    ),
  /one-time/
);

const backupArguments = buildLogicalBackupArguments(direct);
assert.equal(backupArguments[0], 'pg_dump');
assert.equal(backupArguments.at(-1), `--dbname=${direct}`);
assert.throws(() => buildLogicalBackupArguments(pooled), DatabaseConnectionContractError);
assert.throws(() => buildRestoreArguments(direct, direct, 'backup.dump'), /isolated/);
assert.equal(
  buildRestoreArguments(direct, direct.replace('ep-mmdc.', 'ep-mmdc-recovery.'), 'backup.dump')[0],
  'pg_restore'
);

console.log(
  'F02-T02 probe: pooled/direct roles, TLS, seed/reset guards, break-glass, bootstrap, and isolated recovery passed'
);
