#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { assertLocalDatabaseTarget, validateLocalServiceBindAddress } from '../src/operations/local-services.ts';

const composeFile = path.resolve(process.cwd(), 'infrastructure/compose/local.yml');
const action = process.argv[2] ?? 'help';

const usage = () => {
  console.log(`Local service wrapper (Next.js and Payload stay on the host)

Usage: node scripts/local-services.mjs <validate|config|up|down|ps>

The default service bind is 127.0.0.1. A non-loopback bind requires the
documented MMDC_NON_LOOPBACK_CONFIRMATION value. PostgreSQL is enabled only
for MMDC_DATABASE_MODE=postgres; Neon mode uses no local database container.`);
};

const validate = () => {
  const bindAddress = validateLocalServiceBindAddress();
  const target = assertLocalDatabaseTarget();
  console.log(`Local service bind: ${bindAddress}`);
  console.log(`Local database target: ${target.displayName}`);
  return target;
};

if (action === 'help' || action === '--help') {
  usage();
  process.exit(0);
}

if (!['validate', 'config', 'up', 'down', 'ps'].includes(action)) {
  console.error(`Unknown local service action: ${action}`);
  usage();
  process.exit(2);
}

let target;
try {
  target = validate();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'local service validation failed');
  process.exit(1);
}

if (action === 'validate') process.exit(0);

const composeArguments = ['compose', '-f', composeFile];
if (target.mode === 'postgres') composeArguments.push('--profile', 'postgres');
composeArguments.push(action === 'config' ? 'config' : action, ...(action === 'up' ? ['-d'] : []));

const result = spawnSync('docker', composeArguments, { stdio: 'inherit' });
if (result.error) {
  console.error(`Docker Compose could not be started: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
