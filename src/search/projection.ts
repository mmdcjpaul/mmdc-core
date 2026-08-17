import { createHash } from 'node:crypto';

import type { Payload } from 'payload';

import { MeilisearchClient, MeilisearchRequestError } from './client.ts';
import { loadMeilisearchConfig, type MeilisearchRuntimeConfig } from './key-policy.ts';

export const FOUNDATION_SEARCH_COLLECTION = 'foundation-search-records';
export const FOUNDATION_SEARCH_PREFIX = 'foundation';

/** The only fields approved for the synthetic foundation projection. */
export type SyntheticSearchRecord = {
  id: string;
  canonicalVersion: number;
  value: string;
};

export type SyntheticSearchDocument = SyntheticSearchRecord;

export type SearchProjectionJob =
  | {
      operation: 'upsert';
      recordId: string;
      canonicalVersion: number;
      value: string;
    }
  | {
      operation: 'delete';
      recordId: string;
      canonicalVersion: number;
    };

export type ProjectionResult = {
  operation: SearchProjectionJob['operation'];
  recordId: string;
  applied: boolean;
  reason: 'applied' | 'duplicate' | 'stale' | 'missing-canonical-record';
};

export type CanonicalSearchSource = {
  list(): Promise<SyntheticSearchRecord[]>;
  find(recordId: string): Promise<SyntheticSearchRecord | undefined>;
};

export type SearchIndexStore = {
  indexExists(index: string): Promise<boolean>;
  createIndex(index: string): Promise<void>;
  upsert(index: string, documents: SyntheticSearchDocument[]): Promise<void>;
  deleteDocument(index: string, recordId: string): Promise<void>;
  list(index: string): Promise<SyntheticSearchDocument[]>;
  deleteIndex(index: string): Promise<void>;
  swapIndexes(alias: string, versionedIndex: string): Promise<void>;
};

const normaliseRecord = (record: Record<string, unknown>): SyntheticSearchRecord => ({
  id: String(record.id),
  canonicalVersion: Number(record.canonicalVersion),
  value: String(record.value)
});

export class PayloadCanonicalSearchSource implements CanonicalSearchSource {
  private readonly payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  async list(): Promise<SyntheticSearchRecord[]> {
    const result = await this.payload.find({
      collection: FOUNDATION_SEARCH_COLLECTION,
      depth: 0,
      limit: 10_000,
      sort: 'id',
      overrideAccess: true
    });
    return result.docs.map((record) => normaliseRecord(record as unknown as Record<string, unknown>));
  }

  async find(recordId: string): Promise<SyntheticSearchRecord | undefined> {
    const result = await this.payload.find({
      collection: FOUNDATION_SEARCH_COLLECTION,
      depth: 0,
      limit: 1,
      where: { id: { equals: recordId } },
      overrideAccess: true
    });
    const record = result.docs[0];
    return record ? normaliseRecord(record as unknown as Record<string, unknown>) : undefined;
  }
}

export const canonicalSearchChecksum = async (source: CanonicalSearchSource): Promise<string> => {
  const records = (await source.list()).sort((left, right) => left.id.localeCompare(right.id));
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
};

const aliasFor = (config: MeilisearchRuntimeConfig): string => `${config.indexPrefix}-${FOUNDATION_SEARCH_PREFIX}`;

let rebuildSequence = 0;

const versionedIndexFor = (alias: string): string => {
  rebuildSequence = (rebuildSequence + 1) % 10_000;
  return `${alias}__v${new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 17)}${String(rebuildSequence).padStart(4, '0')}`;
};

export class MeilisearchIndexStore implements SearchIndexStore {
  private readonly client: MeilisearchClient;

  constructor(client: MeilisearchClient) {
    this.client = client;
  }

  async indexExists(index: string): Promise<boolean> {
    try {
      await this.client.request('index-read', `/indexes/${encodeURIComponent(index)}`);
      return true;
    } catch (error) {
      if (error instanceof MeilisearchRequestError && error.status === 404) return false;
      throw error;
    }
  }

  private async waitForTask(taskUid: number | undefined): Promise<void> {
    if (taskUid === undefined) return;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const task = await this.client.request<{ status: string; error?: { message?: string } }>(
        'task-read',
        `/tasks/${taskUid}`
      );
      if (task.status === 'succeeded') return;
      if (task.status === 'failed' || task.status === 'canceled') {
        throw new Error(`Meilisearch task ${task.status}: ${task.error?.message ?? 'unknown error'}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Meilisearch task did not complete within 30 seconds');
  }

  private async requestTask<T extends { taskUid?: number }>(
    operation: Parameters<MeilisearchClient['request']>[0],
    path: string,
    init?: RequestInit
  ): Promise<void> {
    const result = await this.client.request<T>(operation, path, init);
    await this.waitForTask(result.taskUid);
  }

  async createIndex(index: string): Promise<void> {
    await this.requestTask('index-write', '/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: index, primaryKey: 'id' })
    });
  }

  async upsert(index: string, documents: SyntheticSearchDocument[]): Promise<void> {
    if (documents.length === 0) return;
    await this.requestTask('index-write', `/indexes/${encodeURIComponent(index)}/documents`, {
      method: 'POST',
      body: JSON.stringify(documents)
    });
  }

  async deleteDocument(index: string, recordId: string): Promise<void> {
    await this.requestTask(
      'index-delete',
      `/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(recordId)}`,
      { method: 'DELETE' }
    );
  }

  async list(index: string): Promise<SyntheticSearchDocument[]> {
    const result = await this.client.request<{ results?: SyntheticSearchDocument[] }>(
      'index-read',
      `/indexes/${encodeURIComponent(index)}/documents?limit=10000`
    );
    return result.results ?? [];
  }

  async deleteIndex(index: string): Promise<void> {
    await this.requestTask('index-delete', `/indexes/${encodeURIComponent(index)}`, { method: 'DELETE' });
  }

  async swapIndexes(alias: string, versionedIndex: string): Promise<void> {
    await this.requestTask('index-swap', '/swap-indexes', {
      method: 'POST',
      body: JSON.stringify([{ indexes: [alias, versionedIndex] }])
    });
  }
}

export class SearchProjectionEngine {
  readonly alias: string;
  private readonly source: CanonicalSearchSource;
  private readonly store: SearchIndexStore;

  constructor(
    source: CanonicalSearchSource,
    store: SearchIndexStore,
    config: MeilisearchRuntimeConfig = loadMeilisearchConfig()
  ) {
    this.source = source;
    this.store = store;
    this.alias = aliasFor(config);
  }

  private async ensureAlias(): Promise<void> {
    if (!(await this.store.indexExists(this.alias))) await this.store.createIndex(this.alias);
  }

  private async currentIndexedVersion(recordId: string): Promise<number | undefined> {
    const document = (await this.store.list(this.alias)).find((candidate) => candidate.id === recordId);
    return document?.canonicalVersion;
  }

  async apply(job: SearchProjectionJob): Promise<ProjectionResult> {
    await this.ensureAlias();
    const current = await this.source.find(job.recordId);
    if (job.operation === 'upsert' && !current) {
      return { operation: job.operation, recordId: job.recordId, applied: false, reason: 'missing-canonical-record' };
    }
    if (current && job.canonicalVersion !== current.canonicalVersion) {
      return { operation: job.operation, recordId: job.recordId, applied: false, reason: 'stale' };
    }
    const indexedVersion = await this.currentIndexedVersion(job.recordId);
    if (indexedVersion !== undefined && indexedVersion > job.canonicalVersion) {
      return { operation: job.operation, recordId: job.recordId, applied: false, reason: 'stale' };
    }
    if (job.operation === 'upsert') {
      if (indexedVersion === job.canonicalVersion) {
        return { operation: job.operation, recordId: job.recordId, applied: false, reason: 'duplicate' };
      }
      await this.store.upsert(this.alias, [
        { id: job.recordId, canonicalVersion: job.canonicalVersion, value: job.value }
      ]);
    } else {
      if (indexedVersion === undefined) {
        return { operation: job.operation, recordId: job.recordId, applied: false, reason: 'duplicate' };
      }
      await this.store.deleteDocument(this.alias, job.recordId);
    }
    return { operation: job.operation, recordId: job.recordId, applied: true, reason: 'applied' };
  }

  async rebuild(): Promise<{ alias: string; versionedIndex: string; count: number; checksum: string }> {
    const records = await this.source.list();
    const checksum = await canonicalSearchChecksum(this.source);
    const versionedIndex = versionedIndexFor(this.alias);
    await this.store.createIndex(versionedIndex);
    try {
      await this.store.upsert(versionedIndex, records);
      const rebuilt = await this.store.list(versionedIndex);
      const expected = new Map(records.map((record) => [record.id, JSON.stringify(record)]));
      if (
        rebuilt.length !== records.length ||
        rebuilt.some((record) => expected.get(record.id) !== JSON.stringify(record))
      ) {
        throw new Error('search rebuild validation failed: candidate index differs from Neon');
      }
      await this.ensureAlias();
      await this.store.swapIndexes(this.alias, versionedIndex);
      return { alias: this.alias, versionedIndex, count: records.length, checksum };
    } catch (error) {
      try {
        await this.store.deleteIndex(versionedIndex);
      } catch {
        // Preserve the original rebuild/swap failure; cleanup is best effort.
      }
      throw error;
    }
  }
}

export const createPayloadSearchProjection = (payload: Payload): SearchProjectionEngine => {
  const config = loadMeilisearchConfig();
  return new SearchProjectionEngine(
    new PayloadCanonicalSearchSource(payload),
    new MeilisearchIndexStore(new MeilisearchClient('admin/indexing', config)),
    config
  );
};
