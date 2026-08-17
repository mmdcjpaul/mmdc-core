import assert from 'node:assert/strict';

const [{ default: config }, { getPayload }, projection, keyPolicy, clientModule] = await Promise.all([
  import('../../payload.config.ts'),
  import('payload'),
  import('../../src/search/projection.ts'),
  import('../../src/search/key-policy.ts'),
  import('../../src/search/client.ts')
]);

const payload = await getPayload({ config });
const runtimeConfig = keyPolicy.loadMeilisearchConfig();
const source = new projection.PayloadCanonicalSearchSource(payload);
const store = new projection.MeilisearchIndexStore(new clientModule.MeilisearchClient('admin/indexing', runtimeConfig));
const engine = new projection.SearchProjectionEngine(source, store, runtimeConfig);

const record = await payload.create({
  collection: projection.FOUNDATION_SEARCH_COLLECTION,
  data: { canonicalVersion: 1, value: 'alpha' },
  overrideAccess: true
});
const recordId = String(record.id);
const v1 = { operation: 'upsert', recordId, canonicalVersion: 1, value: 'alpha' };
assert.equal((await engine.apply(v1)).reason, 'applied');
assert.equal((await engine.apply(v1)).reason, 'duplicate');

const updated = await payload.update({
  collection: projection.FOUNDATION_SEARCH_COLLECTION,
  id: record.id,
  data: { canonicalVersion: 2, value: 'beta' },
  overrideAccess: true
});
const v2 = { operation: 'upsert', recordId, canonicalVersion: 2, value: 'beta' };
assert.equal((await engine.apply(v2)).reason, 'applied');
assert.equal((await engine.apply(v1)).reason, 'stale');
assert.equal((await store.list(engine.alias)).find((item) => item.id === recordId)?.value, 'beta');
assert.equal(Number(updated.canonicalVersion), 2);

const v3 = { operation: 'upsert', recordId, canonicalVersion: 3, value: 'gamma' };
await payload.update({
  collection: projection.FOUNDATION_SEARCH_COLLECTION,
  id: record.id,
  data: { canonicalVersion: 3, value: 'gamma' },
  overrideAccess: true
});
assert.equal((await engine.apply(v3)).reason, 'applied');
assert.equal((await engine.apply(v2)).reason, 'stale');
assert.equal((await engine.apply({ operation: 'delete', recordId, canonicalVersion: 2 })).reason, 'stale');

await payload.delete({
  collection: projection.FOUNDATION_SEARCH_COLLECTION,
  id: record.id,
  overrideAccess: true
});
assert.equal((await engine.apply({ operation: 'delete', recordId, canonicalVersion: 3 })).reason, 'applied');
assert.equal((await engine.apply({ operation: 'delete', recordId, canonicalVersion: 3 })).reason, 'duplicate');

const rebuildRecords = [];
for (const value of ['rebuild-one', 'rebuild-two']) {
  const created = await payload.create({
    collection: projection.FOUNDATION_SEARCH_COLLECTION,
    data: { canonicalVersion: 1, value },
    overrideAccess: true
  });
  rebuildRecords.push({ id: String(created.id), canonicalVersion: 1, value });
}
for (const current of rebuildRecords) {
  assert.equal(
    (
      await engine.apply({
        operation: 'upsert',
        recordId: current.id,
        canonicalVersion: current.canonicalVersion,
        value: current.value
      })
    ).reason,
    'applied'
  );
}

const checksumBefore = await projection.canonicalSearchChecksum(source);
const rebuilt = await engine.rebuild();
assert.equal(rebuilt.count, rebuildRecords.length);
assert.equal(await projection.canonicalSearchChecksum(source), checksumBefore);
assert.deepEqual(
  (await store.list(engine.alias))
    .filter((item) => rebuildRecords.some((record) => record.id === item.id))
    .sort((a, b) => a.id.localeCompare(b.id)),
  rebuildRecords.sort((a, b) => a.id.localeCompare(b.id))
);

await store.deleteIndex(engine.alias);
assert.equal(await projection.canonicalSearchChecksum(source), checksumBefore);
assert.equal(await store.indexExists(engine.alias), false);
await engine.rebuild();
assert.equal((await store.list(engine.alias)).length, rebuildRecords.length);
assert.equal(await projection.canonicalSearchChecksum(source), checksumBefore);

const stableAliasDocuments = JSON.stringify(await store.list(engine.alias));
const failingStore = {
  indexExists: store.indexExists.bind(store),
  createIndex: store.createIndex.bind(store),
  upsert: store.upsert.bind(store),
  deleteDocument: store.deleteDocument.bind(store),
  list: store.list.bind(store),
  deleteIndex: store.deleteIndex.bind(store),
  swapIndexes: async () => {
    throw new Error('deterministic swap failure');
  }
};
await assert.rejects(
  () => new projection.SearchProjectionEngine(source, failingStore, runtimeConfig).rebuild(),
  /deterministic swap failure/
);
assert.equal(JSON.stringify(await store.list(engine.alias)), stableAliasDocuments);

const retryRecord = await payload.create({
  collection: projection.FOUNDATION_SEARCH_COLLECTION,
  data: { canonicalVersion: 1, value: 'restart-retry' },
  overrideAccess: true
});
let firstAttempt = true;
const retryStore = {
  indexExists: store.indexExists.bind(store),
  createIndex: store.createIndex.bind(store),
  upsert: async (index, documents) => {
    if (firstAttempt) {
      firstAttempt = false;
      throw new Error('deterministic transient indexing failure');
    }
    return store.upsert(index, documents);
  },
  deleteDocument: store.deleteDocument.bind(store),
  list: store.list.bind(store),
  deleteIndex: store.deleteIndex.bind(store),
  swapIndexes: store.swapIndexes.bind(store)
};
const retryJob = {
  operation: 'upsert',
  recordId: String(retryRecord.id),
  canonicalVersion: 1,
  value: 'restart-retry'
};
const retryEngine = new projection.SearchProjectionEngine(source, retryStore, runtimeConfig);
await assert.rejects(() => retryEngine.apply(retryJob), /deterministic transient indexing failure/);
assert.equal(
  (await new projection.SearchProjectionEngine(source, retryStore, runtimeConfig).apply(retryJob)).reason,
  'applied'
);

const events = [];
const originalError = console.error;
const originalMeilisearchURL = process.env.MEILISEARCH_URL;
process.env.MEILISEARCH_URL = 'http://127.0.0.1:1';
console.error = (value) => events.push(String(value));
const searchRoute = await import('../../src/app/api/search/route.ts');
const unavailableResponse = await searchRoute.GET(new Request('http://localhost/api/search?q=secret'));
console.error = originalError;
process.env.MEILISEARCH_URL = originalMeilisearchURL;
assert.equal(unavailableResponse.status, 503);
const unavailableBody = await unavailableResponse.text();
assert.equal(unavailableBody, '{"status":"degraded","code":"SEARCH_UNAVAILABLE","results":[]}');
assert.ok(events.some((event) => event.includes('search.unavailable')));
assert.doesNotMatch(unavailableBody, /MEILISEARCH|secret|127\.0\.0\.1/);

await payload.destroy();
console.log(
  'F04-T02 integration probe: duplicate/reordered/stale jobs, restart/retry, rebuild, deletion recovery, atomic swap failure preservation, canonical checksum, and sanitized unavailability passed'
);
process.exit(0);
