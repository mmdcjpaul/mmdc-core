import {
  assertOperationAllowed,
  keyForScope,
  loadMeilisearchConfig,
  type MeilisearchKeyScope,
  type MeilisearchOperation,
  type MeilisearchRuntimeConfig
} from './key-policy.ts';

export class MeilisearchClient {
  private readonly scope: MeilisearchKeyScope;
  private readonly config: MeilisearchRuntimeConfig;

  constructor(scope: MeilisearchKeyScope, config: MeilisearchRuntimeConfig = loadMeilisearchConfig()) {
    this.scope = scope;
    this.config = config;
  }

  async request<T>(operation: MeilisearchOperation, path: string, init: RequestInit = {}): Promise<T> {
    assertOperationAllowed(this.scope, operation);
    if (!path.startsWith('/')) throw new Error('Meilisearch API paths must start with /');

    const headers = new Headers(init.headers);
    headers.set('X-Meili-API-Key', keyForScope(this.config, this.scope));
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${this.config.url}${path}`, { ...init, headers });
    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      throw new Error(`Meilisearch request failed (${response.status})`);
    }
    return body as T;
  }

  search<T>(index: string, query: string): Promise<T> {
    return this.request<T>('search', `/indexes/${encodeURIComponent(index)}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: query })
    });
  }

  index<T>(index: string, documents: unknown[]): Promise<T> {
    return this.request<T>('index-write', `/indexes/${encodeURIComponent(index)}/documents`, {
      method: 'POST',
      body: JSON.stringify(documents)
    });
  }
}
