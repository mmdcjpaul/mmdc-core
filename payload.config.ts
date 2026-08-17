import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { postgresAdapter } from '@payloadcms/db-postgres';
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { s3Storage } from '@payloadcms/storage-s3';
import { buildConfig } from 'payload';
import sharp from 'sharp';

import { Media } from './src/collections/Media.ts';
import { mediaDeliveryEndpoint } from './src/media-delivery.ts';
import { MAX_MEDIA_BYTES } from './src/media-governance.ts';
import { mediaDeliveryPath } from './src/media-storage.ts';
import { FoundationSearchRecords } from './src/collections/FoundationSearchRecords.ts';
import { Users } from './src/collections/Users.ts';
import { loadEnvironment } from './src/environment.ts';
import { foundationSearchProjectionTask, foundationSearchTask } from './src/jobs/foundation-search-task.ts';
import { assertLocalDatabaseTarget } from './src/operations/local-services.ts';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const environment = loadEnvironment();
if (
  environment.phase === 'runtime' &&
  ['local', 'ci'].includes(environment.environmentName) &&
  !environment.internal.compatibilityDatabaseURL
) {
  assertLocalDatabaseTarget();
}
const database = environment.internal.compatibilityDatabaseURL
  ? sqliteAdapter({
      client: {
        url: environment.internal.compatibilityDatabaseURL
      }
    })
  : postgresAdapter({
      pool: {
        connectionString: environment.internal.databaseURL,
        max: environment.internal.databasePoolMax,
        connectionTimeoutMillis: environment.internal.databaseConnectionTimeoutMs,
        idleTimeoutMillis: environment.internal.databaseIdleTimeoutMs
      },
      migrationDir: path.resolve(dirname, 'src/migrations'),
      push: false
    });

const s3Credentials =
  process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
      }
    : undefined;

const mediaStoragePlugin =
  environment.mediaStorage === 's3'
    ? s3Storage({
        alwaysInsertFields: true,
        bucket: environment.media.bucket ?? 'mmdc-build-only-media',
        collections: {
          media: {
            generateFileURL: ({ filename, prefix }) =>
              prefix
                ? mediaDeliveryPath(prefix, filename)
                : `/api/media-delivery/unknown?file=${encodeURIComponent(filename)}`,
            prefix: 'media'
          }
        },
        config: {
          ...(s3Credentials ? { credentials: s3Credentials } : {}),
          ...(environment.media.endpoint ? { endpoint: environment.media.endpoint } : {}),
          forcePathStyle: environment.media.forcePathStyle,
          region: environment.media.region ?? 'mmdc-build-only-region'
        },
        enabled: environment.phase === 'runtime',
        useCompositePrefixes: true
      })
    : undefined;

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: dirname
    }
  },
  collections: [Users, Media, FoundationSearchRecords],
  jobs: {
    addParentToTaskLog: true,
    deleteJobOnComplete: false,
    depth: 0,
    enableConcurrencyControl: true,
    processingOrder: 'createdAt',
    tasks: [foundationSearchTask, foundationSearchProjectionTask]
  },
  plugins: mediaStoragePlugin ? [mediaStoragePlugin] : [],
  upload: {
    limits: {
      fileSize: MAX_MEDIA_BYTES
    }
  },
  db: database,
  endpoints: [
    mediaDeliveryEndpoint,
    {
      path: '/foundation',
      method: 'get',
      handler: async ({ payload }) => {
        const result = await payload.find({
          collection: 'users',
          limit: 0
        });

        return Response.json({
          collections: payload.config.collections.map((collection) => collection.slug),
          localAPI: typeof payload.find === 'function' && result.docs.length === 0 ? 'ready' : 'unavailable'
        });
      }
    }
  ],
  secret: environment.required.payloadSecret ?? 'mmdc-build-only-secret-placeholder',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts')
  }
});
