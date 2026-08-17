export type DatabaseConnectionRole = 'pooled-runtime' | 'direct-administration';

export type DatabaseConnectionContract = {
  role: DatabaseConnectionRole;
  url: URL;
  sslMode: string;
  isNeon: boolean;
};

export class DatabaseConnectionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConnectionContractError';
  }
}

const allowedTLSModes = new Set(['require', 'verify-ca', 'verify-full']);

const parseDatabaseURL = (value: string, role: DatabaseConnectionRole): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DatabaseConnectionContractError(`${role} DATABASE URL is not a valid URL`);
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new DatabaseConnectionContractError(`${role} DATABASE URL must use postgres:// or postgresql://`);
  }

  const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
  if (!sslMode || !allowedTLSModes.has(sslMode)) {
    throw new DatabaseConnectionContractError(
      `${role} DATABASE URL must require TLS with sslmode=require, verify-ca, or verify-full`
    );
  }

  if (!url.hostname) {
    throw new DatabaseConnectionContractError(`${role} DATABASE URL must include a hostname`);
  }

  return url;
};

const isNeonHost = (hostname: string): boolean => hostname.toLowerCase().endsWith('.neon.tech');

export const validateDatabaseConnection = (
  value: string | undefined,
  role: DatabaseConnectionRole,
  options: { allowLocalCompatibility?: boolean } = {}
): DatabaseConnectionContract => {
  if (!value?.trim()) {
    throw new DatabaseConnectionContractError(`${role} DATABASE URL is required`);
  }

  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    throw new DatabaseConnectionContractError(`${role} DATABASE URL is not a valid URL`);
  }
  const localCompatibility = ['127.0.0.1', 'localhost', '::1'].includes(candidate.hostname);
  if (options.allowLocalCompatibility && localCompatibility) {
    if (!['postgres:', 'postgresql:'].includes(candidate.protocol)) {
      throw new DatabaseConnectionContractError(`${role} DATABASE URL must use postgres:// or postgresql://`);
    }
    return {
      role,
      url: candidate,
      sslMode: candidate.searchParams.get('sslmode')?.toLowerCase() ?? 'local',
      isNeon: false
    };
  }

  const parsed = parseDatabaseURL(value, role);
  const neon = isNeonHost(parsed.hostname);
  const pooled = parsed.hostname.toLowerCase().includes('-pooler');

  if (role === 'pooled-runtime' && neon && !pooled) {
    throw new DatabaseConnectionContractError('pooled-runtime DATABASE_URL must use the Neon pooler hostname');
  }
  if (role === 'direct-administration' && neon && pooled) {
    throw new DatabaseConnectionContractError(
      'direct-administration DATABASE_DIRECT_URL must not use the Neon pooler hostname'
    );
  }

  return { role, url: parsed, sslMode: parsed.searchParams.get('sslmode') as string, isNeon: neon };
};

export const validateDatabasePair = (values: {
  pooledURL: string | undefined;
  directURL: string | undefined;
  allowLocalCompatibility?: boolean;
}): { pooled: DatabaseConnectionContract; direct: DatabaseConnectionContract } => {
  const pooled = validateDatabaseConnection(values.pooledURL, 'pooled-runtime', {
    allowLocalCompatibility: values.allowLocalCompatibility
  });
  const direct = validateDatabaseConnection(values.directURL, 'direct-administration', {
    allowLocalCompatibility: values.allowLocalCompatibility
  });

  if (pooled.url.toString() === direct.url.toString()) {
    throw new DatabaseConnectionContractError('pooled and direct DATABASE URLs must be distinct endpoints');
  }

  return { pooled, direct };
};

export const redactDatabaseURL = (value: string): string => {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '<invalid-database-url>';
  }
};

export const runtimeDatabaseURL = (env: Record<string, string | undefined> = process.env): string => {
  const contract = validateDatabaseConnection(env.DATABASE_URL, 'pooled-runtime', {
    allowLocalCompatibility: env.MMDC_ENVIRONMENT === 'local' || env.MMDC_ENVIRONMENT === 'ci'
  });
  return contract.url.toString();
};

export const directAdministrationURL = (env: Record<string, string | undefined> = process.env): string => {
  const contract = validateDatabaseConnection(env.DATABASE_DIRECT_URL, 'direct-administration', {
    allowLocalCompatibility: env.MMDC_ENVIRONMENT === 'local' || env.MMDC_ENVIRONMENT === 'ci'
  });
  return contract.url.toString();
};
