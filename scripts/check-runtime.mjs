#!/usr/bin/env node

const expectedNode = '24.15.0';
const expectedPnpm = '11.20.0';
const actualNode = process.versions.node;
const packageManagerRequired = process.argv.includes('--package-manager');

const failures = [];
if (actualNode !== expectedNode) {
  failures.push(`Node.js ${expectedNode} is required; detected ${actualNode}.`);
}

if (packageManagerRequired) {
  const userAgent = process.env.npm_config_user_agent ?? '';
  const match = userAgent.match(/^([^/]+)\/([^ ]+)/);
  const actualManager = match?.[1] ?? 'unknown';
  const actualVersion = match?.[2] ?? 'unknown';
  if (actualManager !== 'pnpm' || actualVersion !== expectedPnpm) {
    failures.push(
      `pnpm ${expectedPnpm} is required; detected ${actualManager} ${actualVersion}. ` +
        'Activate the repository package manager with Corepack, then run pnpm install.'
    );
  }
}

if (failures.length > 0) {
  console.error('Runtime policy check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('Use Node.js 24.15.0 and pnpm 11.20.0 for this repository.');
  process.exit(1);
}

console.log(
  packageManagerRequired
    ? `Runtime policy passed: Node.js ${expectedNode}, pnpm ${expectedPnpm}.`
    : `Runtime policy passed: Node.js ${expectedNode}.`
);
