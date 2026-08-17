export type MeilisearchKeyScope = 'master' | 'admin/indexing' | 'search-only';

export type MeilisearchOperation = 'health' | 'search' | 'index-read' | 'index-write' | 'index-settings' | 'key-admin';

export type MeilisearchRuntimeConfig = {
  url: string;
  indexPrefix: string;
  masterKey: string;
  adminIndexingKey: string;
  searchOnlyKey: string;
};

const operationsByScope: Record<MeilisearchKeyScope, readonly MeilisearchOperation[]> = {
  master: ['health', 'search', 'index-read', 'index-write', 'index-settings', 'key-admin'],
  'admin/indexing': ['health', 'index-read', 'index-write', 'index-settings'],
  'search-only': ['health', 'search']
};

const required = (env: Record<string, string | undefined>, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the server-owned Meilisearch runtime`);
  return value;
};

const assertInternalURL = (candidate: string): string => {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('MEILISEARCH_URL must be an http:// or https:// URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('MEILISEARCH_URL must be an http:// or https:// URL without credentials');
  }
  if (['0.0.0.0', '::', '[::]'].includes(url.hostname)) {
    throw new Error('MEILISEARCH_URL must not target a wildcard listener');
  }
  return url.toString().replace(/\/$/, '');
};

export const loadMeilisearchConfig = (
  env: Record<string, string | undefined> = process.env
): MeilisearchRuntimeConfig => {
  const masterKey = required(env, 'MEILISEARCH_MASTER_KEY');
  const adminIndexingKey = required(env, 'MEILISEARCH_ADMIN_INDEXING_KEY');
  const searchOnlyKey = required(env, 'MEILISEARCH_SEARCH_ONLY_KEY');
  const keys = new Set([masterKey, adminIndexingKey, searchOnlyKey]);
  if (keys.size !== 3) throw new Error('Meilisearch master, admin/indexing, and search-only keys must be distinct');

  const indexPrefix = env.MEILISEARCH_INDEX_PREFIX?.trim() || 'mmdc';
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(indexPrefix)) {
    throw new Error('MEILISEARCH_INDEX_PREFIX must be a short identifier');
  }

  return {
    url: assertInternalURL(required(env, 'MEILISEARCH_URL')),
    indexPrefix,
    masterKey,
    adminIndexingKey,
    searchOnlyKey
  };
};

export const keyForScope = (config: MeilisearchRuntimeConfig, scope: MeilisearchKeyScope): string => {
  if (scope === 'master') return config.masterKey;
  if (scope === 'admin/indexing') return config.adminIndexingKey;
  return config.searchOnlyKey;
};

export const isOperationAllowed = (scope: MeilisearchKeyScope, operation: MeilisearchOperation): boolean =>
  operationsByScope[scope].includes(operation);

export const assertOperationAllowed = (scope: MeilisearchKeyScope, operation: MeilisearchOperation): void => {
  if (!isOperationAllowed(scope, operation)) {
    throw new Error(`Meilisearch scope ${scope} cannot perform ${operation}`);
  }
};

export const meilisearchKeyPolicy: Readonly<Record<MeilisearchKeyScope, readonly MeilisearchOperation[]>> =
  Object.freeze({
    master: [...operationsByScope.master],
    'admin/indexing': [...operationsByScope['admin/indexing']],
    'search-only': [...operationsByScope['search-only']]
  });
