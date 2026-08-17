#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { bootstrapInitialAdministrator } from '../src/operations/bootstrap.ts';

if (process.argv.includes('--help')) {
  console.log(
    'One-time interactive bootstrap. Credentials are read from the terminal and are never printed or logged.'
  );
  process.exit(0);
}

const readline = createInterface({ input, output });
try {
  const email = await readline.question('Initial administrator email: ');
  const password = await readline.question('Initial administrator password: ');
  const { getPayload } = await import('payload');
  const { default: config } = await import('../payload.config.ts');
  const payload = await getPayload({ config });
  try {
    await bootstrapInitialAdministrator(payload, { email, password });
  } finally {
    await payload.destroy();
  }
  console.log('Initial administrator bootstrap completed.');
} catch {
  console.error('Initial administrator bootstrap failed; no credential was logged.');
  process.exitCode = 1;
} finally {
  readline.close();
}
