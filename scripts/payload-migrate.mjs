#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { validateDatabaseConnection } from '../src/operations/neon.ts';

const directURL = process.env.DATABASE_DIRECT_URL?.trim();
if (!directURL) {
  console.error('DATABASE_DIRECT_URL is required for Payload migrations.');
  process.exit(1);
}

try {
  validateDatabaseConnection(directURL, 'direct-administration', { allowLocalCompatibility: true });
} catch {
  console.error(
    'DATABASE_DIRECT_URL must be a TLS-required direct administrative URL; local compatibility PostgreSQL may use loopback.'
  );
  process.exit(1);
}

const result = spawnSync('payload', process.argv.slice(2), {
  env: {
    ...process.env,
    DATABASE_URL: directURL,
    MMDC_MIGRATION: '1'
  },
  stdio: 'inherit'
});

if (result.error) {
  console.error(`Payload migration failed to start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
