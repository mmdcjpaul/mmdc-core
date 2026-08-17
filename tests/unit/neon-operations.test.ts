import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bootstrapInitialAdministrator } from '../../src/operations/bootstrap';
import {
  DatabaseConnectionContractError,
  validateDatabaseConnection,
  validateDatabasePair
} from '../../src/operations/neon';
import {
  buildLogicalBackupArguments,
  buildRestoreArguments,
  validateRecoveryApproval
} from '../../src/operations/recovery';
import {
  assertSeedRequestAllowed,
  breakGlassGuardValue,
  syntheticFixtureName,
  SeedGuardError
} from '../../src/operations/seed-guard';

const pooled = 'postgresql://runtime@ep-mmdc-pooler.ap-southeast-1.aws.neon.tech/mmdc?sslmode=require';
const direct = 'postgresql://migration@ep-mmdc.ap-southeast-1.aws.neon.tech/mmdc?sslmode=require';

describe('Neon operational contracts', () => {
  it('requires distinct TLS-enabled pooled and direct roles', () => {
    assert.equal(validateDatabasePair({ pooledURL: pooled, directURL: direct }).pooled.role, 'pooled-runtime');
    assert.throws(() => validateDatabaseConnection(direct, 'pooled-runtime'), DatabaseConnectionContractError);
    assert.throws(() => validateDatabaseConnection(pooled, 'direct-administration'), DatabaseConnectionContractError);
    assert.throws(
      () => validateDatabaseConnection(pooled.replace('sslmode=require', ''), 'pooled-runtime'),
      DatabaseConnectionContractError
    );
    assert.throws(
      () => validateDatabasePair({ pooledURL: pooled, directURL: pooled }),
      DatabaseConnectionContractError
    );
  });

  it('allows only the explicit synthetic fixture and protects every shared environment', () => {
    for (const environment of ['development', 'staging', 'production']) {
      assert.throws(
        () => assertSeedRequestAllowed({ action: 'seed', environment, fixture: syntheticFixtureName }),
        SeedGuardError
      );
      assert.throws(
        () => assertSeedRequestAllowed({ action: 'reset', environment, fixture: syntheticFixtureName }),
        SeedGuardError
      );
    }

    const approval = {
      approvalId: 'test-approval',
      approver: 'test approver',
      environment: 'development',
      action: 'seed' as const,
      approvedAt: '2026-08-17T00:00:00Z',
      expiresAt: '2026-08-18T00:00:00Z'
    };
    assert.doesNotThrow(() =>
      assertSeedRequestAllowed({
        action: 'seed',
        environment: 'development',
        fixture: syntheticFixtureName,
        breakGlass: { guardValue: breakGlassGuardValue, approval },
        now: new Date('2026-08-17T12:00:00Z')
      })
    );
    assert.throws(
      () =>
        assertSeedRequestAllowed({
          action: 'seed',
          environment: 'development',
          fixture: 'foundation',
          breakGlass: {
            guardValue: breakGlassGuardValue,
            approval: { ...approval, expiresAt: '2026-08-17T11:00:00Z' }
          },
          now: new Date('2026-08-17T12:00:00Z')
        }),
      SeedGuardError
    );
  });

  it('makes bootstrap one-time and never emits credentials', async () => {
    const calls: unknown[] = [];
    const fakePayload = {
      find: async () => ({ totalDocs: 0 }),
      create: async (args: unknown) => {
        calls.push(args);
      }
    };
    await bootstrapInitialAdministrator(fakePayload, {
      email: 'admin@example.invalid',
      password: 'not-a-logged-password'
    });
    assert.equal(calls.length, 1);
    await assert.rejects(
      () =>
        bootstrapInitialAdministrator(
          { find: async () => ({ totalDocs: 1 }), create: async () => undefined },
          { email: 'admin@example.invalid', password: 'not-a-logged-password' }
        ),
      /one-time/
    );
  });

  it('builds administrative backup and isolated restore commands', () => {
    assert.match(buildLogicalBackupArguments(direct).at(-1) ?? '', /migration@/);
    assert.throws(() => buildLogicalBackupArguments(pooled), DatabaseConnectionContractError);
    assert.throws(() => buildRestoreArguments(direct, direct, 'backup.dump'), /isolated/);
    assert.match(
      buildRestoreArguments(direct, direct.replace('ep-mmdc.', 'ep-mmdc-recovery.'), 'backup.dump')[0],
      /pg_restore/
    );
    assert.doesNotThrow(() =>
      validateRecoveryApproval(
        {
          approvalId: 'restore-approval',
          approver: 'restore approver',
          environment: 'development',
          action: 'restore',
          cutoverProcedureId: 'cutover-procedure',
          approvedAt: '2026-08-17T00:00:00Z',
          expiresAt: '2026-08-18T00:00:00Z'
        },
        'development',
        new Date('2026-08-17T12:00:00Z')
      )
    );
  });
});
