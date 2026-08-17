import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EnvironmentValidationError, loadEnvironment } from '../../src/environment';

describe('server environment contract', () => {
  it('separates required, internal, and public values', () => {
    const environment = loadEnvironment(
      {
        PAYLOAD_SECRET: 'runtime-secret',
        DATABASE_URL: 'postgresql://db.example/mmdc',
        DATABASE_DIRECT_URL: 'postgresql://direct.example/mmdc',
        INTERNAL_API_URL: 'https://internal.example',
        NEXT_PUBLIC_SITE_URL: 'https://www.example'
      },
      'runtime'
    );

    assert.equal(environment.required.payloadSecret, 'runtime-secret');
    assert.equal(environment.internal.databaseURL, 'postgresql://db.example/mmdc');
    assert.equal(environment.public.siteURL, 'https://www.example');
  });

  it('uses non-network build placeholders without accepting an invalid runtime', () => {
    const buildEnvironment = loadEnvironment({}, 'build');
    assert.match(buildEnvironment.required.payloadSecret ?? '', /build-only/);
    assert.match(buildEnvironment.internal.databaseURL ?? '', /127\.0\.0\.1:1/);

    assert.throws(() => loadEnvironment({}, 'runtime'), EnvironmentValidationError);
  });

  it('rejects malformed internal and public URLs without exposing values', () => {
    assert.throws(
      () =>
        loadEnvironment(
          {
            PAYLOAD_SECRET: 'runtime-secret',
            DATABASE_URL: 'https://not-postgres.example',
            INTERNAL_API_URL: 'javascript:alert(1)',
            NEXT_PUBLIC_SITE_URL: 'not-a-url'
          },
          'runtime'
        ),
      /DATABASE_URL|INTERNAL_API_URL|NEXT_PUBLIC_SITE_URL/
    );

    assert.throws(
      () =>
        loadEnvironment(
          {
            PAYLOAD_SECRET: 'do-not-print-this-secret',
            DATABASE_URL: 'not-a-database'
          },
          'runtime'
        ),
      (error: unknown) => !(error instanceof Error) || !error.message.includes('do-not-print-this-secret')
    );
  });
});
