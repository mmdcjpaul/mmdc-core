#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const action = process.argv[2] ?? 'help';
const actionArguments = process.argv.slice(3);
const envFile = path.join(root, '.env.local');
const stateDirectory = path.resolve(process.env.MMDC_WORKFLOW_STATE_DIR || path.join(root, '.mmdc'));
const stateFile = path.join(stateDirectory, 'developer-workflow.json');
const logFile = path.join(stateDirectory, 'next.log');
const localServiceScript = path.join(root, 'scripts', 'local-services.mjs');
const payloadCommandScript = path.join(root, 'scripts', 'payload-command.mjs');
const payloadMigrationScript = path.join(root, 'scripts', 'payload-migrate.mjs');
const payloadSeedScript = path.join(root, 'scripts', 'payload-seed.mjs');

const usage = () => {
  console.log(`MMDC developer workflow

Usage: pnpm run <command>

Lifecycle: setup, start, health, stop
Data and code: seed, reset, generate:types, migrate:create, migrate:apply
Processes and verification: worker, search:rebuild, test, typecheck, lint, build, container:smoke

start runs the host Next.js development server when no production build exists.
After pnpm run build, start runs the standalone production server instead.
`);
};

const value = (candidate) => (candidate ?? '').trim();

const parseEnvLine = (line) => {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) return undefined;
  let parsed = match[2];
  if ((parsed.startsWith('"') && parsed.endsWith('"')) || (parsed.startsWith("'") && parsed.endsWith("'"))) {
    parsed = parsed.slice(1, -1);
  }
  return [match[1], parsed];
};

const loadLocalEnvironment = () => {
  const loaded = { ...process.env };
  for (const candidate of [path.join(root, '.env'), envFile]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue;
      const parsed = parseEnvLine(line);
      if (parsed && loaded[parsed[0]] === undefined) loaded[parsed[0]] = parsed[1];
    }
  }
  return loaded;
};

const fail = (message) => {
  console.error(`developer workflow: ${message}`);
  process.exitCode = 1;
};

const run = (command, arguments_, environment = loadLocalEnvironment(), options = {}) => {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    env: environment,
    stdio: options.stdio ?? 'inherit'
  });
  if (result.error) {
    fail(
      `${options.label ?? command} could not start. ${options.remediation ?? 'Check that the prerequisite is installed.'}`
    );
    return 1;
  }
  return result.status ?? 1;
};

const runNode = (arguments_, environment = loadLocalEnvironment(), options = {}) =>
  run(process.execPath, arguments_, environment, options);

const requireEnvironmentFile = () => {
  if (!existsSync(envFile)) {
    throw new Error('no .env.local file found; run pnpm run setup first');
  }
};

const isRunning = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const readState = () => {
  if (!existsSync(stateFile)) return undefined;
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    throw new Error('workflow state is unreadable; remove .mmdc/developer-workflow.json and run setup again');
  }
};

const writeState = (state) => {
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
};

const removeState = () => {
  try {
    unlinkSync(stateFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const localServices = (serviceAction, environment) => {
  if (value(environment.MMDC_SKIP_LOCAL_SERVICES) === '1') {
    console.log('Local dependency services skipped by MMDC_SKIP_LOCAL_SERVICES=1.');
    return 0;
  }
  return runNode([localServiceScript, serviceAction], environment, {
    label: `local service ${serviceAction}`,
    remediation: 'Install Docker Desktop or Docker Engine with Compose v2, then run pnpm run setup.'
  });
};

const setup = () => {
  const runtimeStatus = runNode([path.join(root, 'scripts', 'check-runtime.mjs'), '--package-manager'], process.env, {
    label: 'runtime check',
    remediation: 'Activate Node.js 24.15.0 and pnpm 11.20.0 with Corepack.'
  });
  if (runtimeStatus !== 0) return runtimeStatus;

  if (!existsSync(envFile)) {
    if (!existsSync(path.join(root, '.env.example'))) {
      fail('cannot create .env.local because .env.example is missing');
      return 1;
    }
    let contents = readFileSync(path.join(root, '.env.example'), 'utf8');
    contents = contents.replace(
      /^MMDC_DATABASE_TARGET_CONFIRMATION=.*$/m,
      'MMDC_DATABASE_TARGET_CONFIRMATION=local:postgres:local-postgres-compatibility'
    );
    writeFileSync(envFile, contents, { mode: 0o600 });
    console.log('Created .env.local from .env.example with the isolated local target confirmation.');
  } else {
    console.log('.env.local already exists; preserving developer values.');
  }

  mkdirSync(path.join(root, 'media'), { recursive: true });
  const installStatus = run(
    'pnpm',
    ['install', '--frozen-lockfile'],
    { ...process.env, CI: 'true' },
    {
      label: 'frozen dependency installation',
      remediation: 'Check network access and the pinned pnpm 11.20.0 runtime; no credentials are needed.'
    }
  );
  if (installStatus !== 0) return installStatus;
  return runNode([payloadCommandScript, 'generate:types'], loadLocalEnvironment(), {
    label: 'Payload type generation',
    remediation: 'Run pnpm run generate:types after correcting the local dependency installation.'
  });
};

const start = async () => {
  requireEnvironmentFile();
  const environment = loadLocalEnvironment();
  const existing = readState();
  if (existing && isRunning(existing.childPid ?? existing.pid)) {
    console.log(`MMDC is already running at http://${existing.host}:${existing.port}.`);
    return 0;
  }
  removeState();

  const serviceStatus = localServices('up', environment);
  if (serviceStatus !== 0) return serviceStatus;

  const host = value(environment.MMDC_DEV_HOST) || '127.0.0.1';
  const port = Number(value(environment.PORT) || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const nextEntry = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(nextEntry)) throw new Error('Next.js is not installed; run pnpm run setup first');

  const production =
    value(environment.MMDC_START_MODE) !== 'development' && existsSync(path.join(root, '.next', 'BUILD_ID'));
  const nextArguments = [
    nextEntry,
    production ? 'start' : 'dev',
    ...(production ? [] : ['--webpack']),
    '--hostname',
    host,
    '--port',
    String(port)
  ];
  const logHandle = await import('node:fs').then(({ openSync }) => openSync(logFile, 'a', 0o600));
  const child = spawn(process.execPath, nextArguments, {
    cwd: root,
    env: environment,
    detached: false,
    stdio: ['ignore', logHandle, logHandle]
  });
  writeState({
    pid: process.pid,
    childPid: child.pid,
    host,
    port,
    mode: production ? 'production' : 'development',
    skipLocalServices: value(environment.MMDC_SKIP_LOCAL_SERVICES) === '1'
  });
  console.log(`MMDC ${production ? 'production' : 'development'} server starting at http://${host}:${port}.`);

  let stopping = false;
  const stopChild = () => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null) child.kill('SIGTERM');
  };
  process.once('SIGINT', stopChild);
  process.once('SIGTERM', stopChild);
  const exitCode = await new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  );
  removeState();
  if (stopping && !value(environment.MMDC_SKIP_LOCAL_SERVICES)) localServices('down', environment);
  return exitCode;
};

const health = async () => {
  let state = readState();
  for (let attempt = 0; !state && attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    state = readState();
  }
  if (!state) throw new Error('MMDC is not running; run pnpm run start first');
  const url = `http://${state.host}:${state.port}/api/health`;
  let lastFailure = 'no response';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      const body = await response.text();
      if (response.ok && body.includes('"status":"ok"')) {
        console.log(`MMDC health passed: ${url}`);
        return 0;
      }
      lastFailure = `HTTP ${response.status}`;
    } catch {
      lastFailure = 'server is still starting';
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`health check failed for ${url} (${lastFailure}); inspect .mmdc/next.log`);
};

const stop = async () => {
  const state = readState();
  if (!state) {
    console.log('MMDC is already stopped.');
    return 0;
  }
  if (isRunning(state.pid)) {
    process.kill(state.pid, 'SIGTERM');
    for (let attempt = 0; attempt < 40 && isRunning(state.pid); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (isRunning(state.pid)) process.kill(state.pid, 'SIGKILL');
  }
  if (state.childPid && isRunning(state.childPid)) process.kill(state.childPid, 'SIGTERM');
  removeState();
  if (!state.skipLocalServices) {
    const serviceStatus = localServices('down', loadLocalEnvironment());
    if (serviceStatus !== 0) return serviceStatus;
  }
  console.log('MMDC stopped.');
  return 0;
};

const delegated = {
  'generate:types': [payloadCommandScript, 'generate:types'],
  'migrate:create': [payloadMigrationScript, 'migrate:create'],
  'migrate:apply': [payloadMigrationScript, 'migrate'],
  'migrate:status': [payloadMigrationScript, 'migrate:status'],
  seed: [payloadSeedScript],
  reset: [payloadSeedScript, '--reset']
};

const unavailable = (name, prerequisite) => {
  if (actionArguments.includes('--help')) {
    console.log(`${name} command contract is reserved for ${prerequisite}.`);
    return 0;
  }
  throw new Error(`${name} requires ${prerequisite}; that prerequisite is not present in this foundation ticket`);
};

try {
  let status = 0;
  switch (action) {
    case 'help':
    case '--help':
      usage();
      break;
    case 'setup':
      status = setup();
      break;
    case 'start':
      status = await start();
      break;
    case 'health':
      status = await health();
      break;
    case 'stop':
      status = await stop();
      break;
    case 'worker':
      status = unavailable('worker', 'F04-T01 worker runtime');
      break;
    case 'search:rebuild':
      status = unavailable('search:rebuild', 'F04-T02 search projection and rebuild runtime');
      break;
    case 'container:smoke':
      if (actionArguments.includes('--help')) {
        console.log(
          'container:smoke runs the production image smoke test after F06-T01 provides Dockerfile and Compose runtime.'
        );
        break;
      }
      if (!existsSync(path.join(root, 'Dockerfile'))) {
        throw new Error(
          'container:smoke requires Dockerfile from F06-T01; the production container is not present yet'
        );
      }
      throw new Error('container:smoke has no configured production Compose target');
    default:
      if (delegated[action]) {
        const environment = loadLocalEnvironment();
        status = runNode(
          ['--experimental-strip-types', delegated[action][0], ...delegated[action].slice(1), ...actionArguments],
          environment,
          {
            label: action,
            remediation: 'Run pnpm run setup and verify the documented local environment.'
          }
        );
      } else {
        throw new Error(`unknown workflow command: ${action}; run pnpm run help`);
      }
  }
  process.exitCode = status;
} catch (error) {
  fail(error instanceof Error ? error.message : 'command failed');
}
