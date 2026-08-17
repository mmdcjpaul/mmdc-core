import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertOperationAllowed,
  isOperationAllowed,
  loadMeilisearchConfig,
  meilisearchKeyPolicy
} from '../../src/search/key-policy.ts';
import { MeilisearchClient } from '../../src/search/client.ts';

const privileged = {
  MEILISEARCH_URL: 'http://127.0.0.1:0',
  MEILISEARCH_MASTER_KEY: 'F04-T01-master-key-sentinel',
  MEILISEARCH_ADMIN_INDEXING_KEY: 'F04-T01-admin-key-sentinel',
  MEILISEARCH_SEARCH_ONLY_KEY: 'F04-T01-search-key-sentinel',
  MEILISEARCH_INDEX_PREFIX: 'mmdc'
};
const expectedScopes = ['master', 'admin/indexing', 'search-only'];
const config = loadMeilisearchConfig(privileged);

assert.deepEqual(Object.keys(meilisearchKeyPolicy).sort(), expectedScopes.sort());
assert.equal(new Set(Object.values(privileged).slice(1, 4)).size, 3);
assert.equal(isOperationAllowed('master', 'key-admin'), true);
assert.equal(isOperationAllowed('admin/indexing', 'index-write'), true);
assert.equal(isOperationAllowed('admin/indexing', 'key-admin'), false);
assert.equal(isOperationAllowed('search-only', 'search'), true);
assert.equal(isOperationAllowed('search-only', 'index-write'), false);
assert.throws(() => assertOperationAllowed('search-only', 'index-write'), /cannot perform index-write/);
assert.throws(
  () => loadMeilisearchConfig({ ...privileged, MEILISEARCH_SEARCH_ONLY_KEY: privileged.MEILISEARCH_MASTER_KEY }),
  /must be distinct/
);
assert.throws(() => loadMeilisearchConfig({ ...privileged, MEILISEARCH_URL: 'http://0.0.0.0:7700' }), /wildcard/);

const requests = [];
globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers);
  const key = headers.get('x-meili-api-key');
  const operation = String(url).endsWith('/search')
    ? 'search'
    : String(url).endsWith('/documents')
      ? 'index-write'
      : 'key-admin';
  requests.push({ key, operation });
  const scope = Object.entries({
    master: config.masterKey,
    'admin/indexing': config.adminIndexingKey,
    'search-only': config.searchOnlyKey
  }).find(([, value]) => value === key)?.[0];
  if (!scope || !isOperationAllowed(scope, operation)) {
    return new Response(null, { status: 403 });
  }
  return Response.json({ ok: true });
};
const liveConfig = { ...config, url: 'http://meilisearch.internal:7700' };

await new MeilisearchClient('search-only', liveConfig).search('foundation', 'safe');
await new MeilisearchClient('admin/indexing', liveConfig).index('foundation', [{ id: '1' }]);
await new MeilisearchClient('master', liveConfig).request('key-admin', '/keys');
await assert.rejects(
  () => new MeilisearchClient('search-only', liveConfig).request('index-write', '/indexes/foundation/documents'),
  /cannot perform index-write/
);
await assert.rejects(
  () => new MeilisearchClient('admin/indexing', liveConfig).request('key-admin', '/keys'),
  /cannot perform key-admin/
);
assert.deepEqual(
  requests.map(({ key, operation }) => ({ key, operation })),
  [
    { key: config.searchOnlyKey, operation: 'search' },
    { key: config.adminIndexingKey, operation: 'index-write' },
    { key: config.masterKey, operation: 'key-admin' }
  ]
);
const sharedCompose = readFileSync('infrastructure/compose/shared.yml', 'utf8');
assert.match(sharedCompose, /image: getmeili\/meilisearch:v1\.51\.0/);
assert.match(sharedCompose, /MEILI_ENV: production/);
assert.match(sharedCompose, /MEILI_MASTER_KEY: \$\{MEILISEARCH_MASTER_KEY:\?MEILISEARCH_MASTER_KEY is required\}/);
assert.match(sharedCompose, /mmdc-internal:\n    internal: true/);
assert.doesNotMatch(sharedCompose, /^\s+ports:/m);
assert.match(sharedCompose, /web:\n(?:.|\n)*?image: \$\{MMDC_APPLICATION_IMAGE/);
assert.match(sharedCompose, /worker:\n(?:.|\n)*?image: \$\{MMDC_APPLICATION_IMAGE/);
assert.match(sharedCompose, /command: \['pnpm', 'run', 'start'\]/);
assert.match(sharedCompose, /command: \['pnpm', 'run', 'worker'\]/);

console.log(
  'F04-T01 policy probe: distinct key scopes, permitted/denied API actions, protected production Meilisearch, and private shared network passed'
);
