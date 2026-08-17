import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Media } from '../../src/collections/Media.ts';
import {
  assertDestructiveDatabaseTarget,
  localServiceDefaultBindAddress,
  nonLoopbackServiceConfirmation,
  resolveLocalDatabaseTarget,
  validateLocalServiceBindAddress
} from '../../src/operations/local-services.ts';

const localPostgres = {
  MMDC_ENVIRONMENT: 'local',
  MMDC_DATABASE_MODE: 'postgres',
  DATABASE_URL: 'postgresql://mmdc@127.0.0.1:5432/mmdc_local'
};
const postgresTarget = resolveLocalDatabaseTarget(localPostgres);
assert.equal(postgresTarget.mode, 'postgres');
assert.match(postgresTarget.displayName, /local PostgreSQL 17 compatibility service/);
assert.equal(postgresTarget.url.hostname, '127.0.0.1');
assert.throws(
  () => assertDestructiveDatabaseTarget(postgresTarget, undefined),
  /destructive local database command refused/
);
assert.doesNotThrow(() => assertDestructiveDatabaseTarget(postgresTarget, postgresTarget.confirmation));

const localNeon = {
  MMDC_ENVIRONMENT: 'local',
  MMDC_DATABASE_MODE: 'neon',
  MMDC_NEON_BRANCH: 'local-alice',
  DATABASE_URL: 'postgresql://runtime@ep-local-pooler.ap-southeast-1.aws.neon.tech/mmdc_local?sslmode=require',
  DATABASE_DIRECT_URL: 'postgresql://migration@ep-local.ap-southeast-1.aws.neon.tech/mmdc_local?sslmode=require'
};
const neonTarget = resolveLocalDatabaseTarget(localNeon);
assert.equal(neonTarget.mode, 'neon');
assert.match(neonTarget.displayName, /isolated Neon branch local-alice/);
assert.throws(
  () => assertDestructiveDatabaseTarget(neonTarget, 'local:neon:local-other'),
  /destructive local database command refused/
);
assert.doesNotThrow(() => assertDestructiveDatabaseTarget(neonTarget, neonTarget.confirmation));

assert.throws(
  () => resolveLocalDatabaseTarget({ ...localNeon, MMDC_NEON_BRANCH: 'development' }),
  /isolated MMDC_NEON_BRANCH/
);
assert.throws(
  () =>
    resolveLocalDatabaseTarget({
      ...localNeon,
      DATABASE_URL: 'postgresql://runtime@db-production.internal/mmdc_local'
    }),
  /shared development, staging, or production name/
);
assert.throws(
  () => resolveLocalDatabaseTarget({ ...localPostgres, DATABASE_URL: 'postgresql://mmdc@db.example/mmdc_local' }),
  /loopback database host/
);
assert.throws(
  () => resolveLocalDatabaseTarget({ ...localPostgres, DATABASE_URL: 'postgresql://mmdc@127.0.0.1:5432/mmdc' }),
  /database name marked local/
);

assert.equal(validateLocalServiceBindAddress({}), localServiceDefaultBindAddress);
assert.throws(
  () => validateLocalServiceBindAddress({ MMDC_LOCAL_SERVICE_BIND_ADDRESS: '0.0.0.0' }),
  /requires MMDC_NON_LOOPBACK_CONFIRMATION/
);
assert.equal(
  validateLocalServiceBindAddress({
    MMDC_LOCAL_SERVICE_BIND_ADDRESS: '0.0.0.0',
    MMDC_NON_LOOPBACK_CONFIRMATION: nonLoopbackServiceConfirmation
  }),
  '0.0.0.0'
);

assert.match(String(Media.upload?.staticDir), /(^|[/\\])media$/);
assert.equal(process.env.AWS_ACCESS_KEY_ID, undefined);
assert.equal(process.env.AWS_SECRET_ACCESS_KEY, undefined);

const composePath = process.argv[2];
assert.ok(composePath, 'rendered Compose JSON path is required');
const compose = JSON.parse(readFileSync(composePath, 'utf8'));
assert.equal(compose.name, 'mmdc-local');
assert.equal(compose.services.meilisearch.image, 'getmeili/meilisearch:v1.51.0');
assert.equal(compose.services.postgres.image, 'postgres:17');
assert.equal(compose.services.meilisearch.ports[0].host_ip, '127.0.0.1');
assert.equal(compose.services.meilisearch.ports[0].published, '7700');
assert.equal(compose.services.postgres.ports[0].host_ip, '127.0.0.1');
assert.equal(compose.services.postgres.ports[0].published, '5432');
assert.equal(compose.services.postgres.environment.POSTGRES_DB, 'mmdc_local');
assert.equal(compose.services.postgres.profiles[0], 'postgres');
assert.equal(Object.hasOwn(compose.services, 'next'), false);
assert.equal(Object.hasOwn(compose.services, 'payload'), false);

console.log(
  'F03-T01 probe: local PostgreSQL, isolated Neon, target confirmation, media storage, and loopback binding passed'
);
