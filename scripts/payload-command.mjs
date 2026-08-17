#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const result = spawnSync('payload', process.argv.slice(2), {
  env: { ...process.env, MMDC_BUILD: '1' },
  stdio: 'inherit'
});

if (result.error) {
  console.error(`Payload command failed to start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
