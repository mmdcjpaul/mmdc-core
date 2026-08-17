import net from 'node:net';

import { validateDatabaseConnection } from './neon.ts';

export type LocalDatabaseMode = 'postgres' | 'neon';

export type LocalDatabaseTarget = {
  mode: LocalDatabaseMode;
  label: string;
  databaseName: string;
  displayName: string;
  confirmation: string;
  url: URL;
};

export const localServiceDefaultBindAddress = '127.0.0.1';
export const nonLoopbackServiceConfirmation = 'I_UNDERSTAND_NON_LOOPBACK_LOCAL_SERVICES';

const localEnvironmentNames = new Set(['local', 'ci']);
const sharedTargetMarker = /(^|[-_.:/])(development|staging|production|dev|stage|prod|shared|main|root)(?=$|[-_.:/])/i;

const value = (candidate: string | undefined): string => candidate?.trim() ?? '';

const hasSharedMarker = (...candidates: string[]): boolean =>
  candidates.some((candidate) => sharedTargetMarker.test(candidate));

const parseURL = (candidate: string, label: string): URL => {
  try {
    return new URL(candidate);
  } catch {
    throw new Error(`${label} must be a valid database URL`);
  }
};

const databaseNameFromURL = (url: URL): string => decodeURIComponent(url.pathname.replace(/^\//, '')).trim();

const isLoopbackHost = (hostname: string): boolean => {
  const normalized = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return (
    normalized === 'localhost' || normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.')
  );
};

const localLabel = (candidate: string, fallback: string): string => {
  const label = value(candidate) || fallback;
  if (!/^(local|ci)([-_].+)?$/i.test(label) || hasSharedMarker(label)) {
    throw new Error(
      `local database target label must identify an isolated local or CI target: ${label || '<missing>'}`
    );
  }
  return label;
};

const modeFromEnvironment = (env: Record<string, string | undefined>): LocalDatabaseMode => {
  const requested = value(env.MMDC_DATABASE_MODE).toLowerCase() || 'postgres';
  if (requested === 'postgres' || requested === 'postgresql') return 'postgres';
  if (requested === 'neon') return 'neon';
  throw new Error(`MMDC_DATABASE_MODE must be postgres or neon; received ${requested}`);
};

export const resolveLocalDatabaseTarget = (
  env: Record<string, string | undefined> = process.env
): LocalDatabaseTarget => {
  const environment = value(env.MMDC_ENVIRONMENT).toLowerCase() || 'local';
  if (!localEnvironmentNames.has(environment)) {
    throw new Error(`local database target guards only accept local or ci; received ${environment}`);
  }

  const mode = modeFromEnvironment(env);
  const url = parseURL(value(env.DATABASE_URL), 'DATABASE_URL');
  const databaseName = databaseNameFromURL(url);
  const targetLabel = value(env.MMDC_DATABASE_TARGET_NAME);

  if (!databaseName || hasSharedMarker(databaseName, url.hostname, url.toString())) {
    throw new Error('local database target must not use a shared development, staging, or production name');
  }

  if (mode === 'postgres') {
    if (!isLoopbackHost(url.hostname)) {
      throw new Error('local PostgreSQL compatibility mode must use a loopback database host');
    }
    if (!/(^|[-_])local($|[-_])/i.test(databaseName) && databaseName !== 'mmdc_local') {
      throw new Error('local PostgreSQL compatibility mode requires a database name marked local');
    }

    const label = localLabel(targetLabel, 'local-postgres-compatibility');
    return {
      mode,
      label,
      databaseName,
      displayName: `local PostgreSQL 17 compatibility service (${label}, ${url.hostname}/${databaseName})`,
      confirmation: `local:${mode}:${label}`,
      url
    };
  }

  const branch = value(env.MMDC_NEON_BRANCH) || value(env.MMDC_LOCAL_NEON_BRANCH);
  if (!branch || !/^local([-_].+)?$/i.test(branch) || hasSharedMarker(branch)) {
    throw new Error('local Neon mode requires an explicitly named isolated MMDC_NEON_BRANCH beginning with local-');
  }
  const contract = validateDatabaseConnection(value(env.DATABASE_URL), 'pooled-runtime');
  if (!contract.isNeon) throw new Error('local Neon mode requires a Neon database host');
  if (env.DATABASE_DIRECT_URL) {
    validateDatabaseConnection(env.DATABASE_DIRECT_URL, 'direct-administration');
  }

  const label = localLabel(targetLabel || branch, branch);
  return {
    mode,
    label,
    databaseName,
    displayName: `isolated Neon branch ${branch} (${url.hostname}/${databaseName})`,
    confirmation: `local:${mode}:${label}`,
    url
  };
};

export const assertDestructiveDatabaseTarget = (
  target: LocalDatabaseTarget,
  confirmation: string | undefined
): void => {
  if (value(confirmation) !== target.confirmation) {
    throw new Error(
      `destructive local database command refused. Target: ${target.displayName}. ` +
        `Set MMDC_DATABASE_TARGET_CONFIRMATION=${target.confirmation} after reviewing it.`
    );
  }
};

export const assertLocalDatabaseTarget = (env: Record<string, string | undefined> = process.env): LocalDatabaseTarget =>
  resolveLocalDatabaseTarget(env);

export const validateLocalServiceBindAddress = (env: Record<string, string | undefined> = process.env): string => {
  const bindAddress = value(env.MMDC_LOCAL_SERVICE_BIND_ADDRESS) || localServiceDefaultBindAddress;
  const loopback = bindAddress === 'localhost' || (net.isIP(bindAddress) > 0 && isLoopbackHost(bindAddress));
  if (!net.isIP(bindAddress) && bindAddress !== 'localhost') {
    throw new Error(`MMDC_LOCAL_SERVICE_BIND_ADDRESS must be an IPv4 or IPv6 address: ${bindAddress}`);
  }
  if (!loopback && value(env.MMDC_NON_LOOPBACK_CONFIRMATION) !== nonLoopbackServiceConfirmation) {
    throw new Error(
      `non-loopback local service binding (${bindAddress}) requires ` +
        `MMDC_NON_LOOPBACK_CONFIRMATION=${nonLoopbackServiceConfirmation}`
    );
  }
  return bindAddress;
};
