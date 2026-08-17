import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { postgresAdapter } from '@payloadcms/db-postgres';
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { buildConfig } from 'payload';
import sharp from 'sharp';

import { Users } from './src/collections/Users.ts';
import { loadEnvironment } from './src/environment.ts';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const environment = loadEnvironment();
const database = environment.internal.compatibilityDatabaseURL
  ? sqliteAdapter({
      client: {
        url: environment.internal.compatibilityDatabaseURL
      }
    })
  : postgresAdapter({
      pool: {
        connectionString: environment.internal.databaseURL,
        max: 10
      },
      push: false
    });

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: dirname
    }
  },
  collections: [Users],
  db: database,
  endpoints: [
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
