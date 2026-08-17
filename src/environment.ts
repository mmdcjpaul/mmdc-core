export type EnvironmentPhase = 'build' | 'runtime';
export type DatabaseMode = 'postgres' | 'neon';

export type EnvironmentSnapshot = {
  phase: EnvironmentPhase;
  environmentName: string;
  databaseMode: DatabaseMode;
  mediaStorage: 'local' | 's3';
  media: {
    bucket: string | undefined;
    region: string | undefined;
    endpoint: string | undefined;
    forcePathStyle: boolean;
  };
  required: {
    payloadSecret: string | undefined;
  };
  internal: {
    databaseURL: string | undefined;
    databaseDirectURL: string | undefined;
    databasePoolMax: number;
    databaseConnectionTimeoutMs: number;
    databaseIdleTimeoutMs: number;
    internalAPIURL: string | undefined;
    compatibilityDatabaseURL: string | undefined;
  };
  public: {
    siteURL: string | undefined;
  };
};

export class EnvironmentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: string[]) {
    super(`Invalid server environment: ${issues.join(', ')}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

const buildSecret = 'mmdc-build-only-secret-placeholder';
const buildDatabaseURL = 'postgresql://127.0.0.1:1/mmdc-build-only';
const defaultDatabasePoolMax = 10;
const defaultDatabaseConnectionTimeoutMs = 5_000;
const defaultDatabaseIdleTimeoutMs = 30_000;
const supportedEnvironments = new Set(['local', 'ci', 'development', 'staging', 'production']);

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const mediaBucketHasEnvironment = (bucket: string, environmentName: string): boolean => {
  const escapedEnvironment = environmentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|-)${escapedEnvironment}(-|$)`).test(bucket);
};

const boundedInteger = (value: string | undefined, fallback: number, minimum: number, maximum: number): number => {
  if (!value?.trim()) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
};

const isURLWithProtocol = (value: string | undefined, protocols: string[]): boolean => {
  if (!value) return true;

  try {
    const url = new URL(value);
    return protocols.includes(url.protocol);
  } catch {
    return false;
  }
};

export const loadEnvironment = (
  env: Record<string, string | undefined> = process.env,
  phase: EnvironmentPhase = process.env.NEXT_PHASE === 'phase-production-build' || env.MMDC_BUILD === '1'
    ? 'build'
    : 'runtime'
): EnvironmentSnapshot => {
  const environmentName = nonEmpty(env.MMDC_ENVIRONMENT)?.toLowerCase() ?? 'local';
  const requestedDatabaseMode = nonEmpty(env.MMDC_DATABASE_MODE)?.toLowerCase() ?? 'postgres';
  const databaseMode: DatabaseMode = requestedDatabaseMode === 'neon' ? 'neon' : 'postgres';
  const requestedMediaStorage = nonEmpty(env.MMDC_MEDIA_STORAGE)?.toLowerCase() ?? 'local';
  const mediaStorage = requestedMediaStorage === 's3' ? ('s3' as const) : ('local' as const);
  const mediaBucket = nonEmpty(env.MMDC_MEDIA_BUCKET) ?? nonEmpty(env.S3_BUCKET);
  const mediaRegion = nonEmpty(env.MMDC_MEDIA_REGION) ?? nonEmpty(env.S3_REGION);
  const mediaEndpoint = nonEmpty(env.MMDC_MEDIA_ENDPOINT) ?? nonEmpty(env.S3_ENDPOINT);
  const mediaForcePathStyle = (nonEmpty(env.MMDC_MEDIA_FORCE_PATH_STYLE) ?? nonEmpty(env.S3_FORCE_PATH_STYLE)) === '1';
  const snapshot: EnvironmentSnapshot = {
    phase,
    environmentName,
    databaseMode,
    mediaStorage,
    media: {
      bucket: mediaBucket,
      region: mediaRegion,
      endpoint: mediaEndpoint,
      forcePathStyle: mediaForcePathStyle
    },
    required: {
      payloadSecret: nonEmpty(env.PAYLOAD_SECRET)
    },
    internal: {
      databaseURL: nonEmpty(env.DATABASE_URL),
      databaseDirectURL: nonEmpty(env.DATABASE_DIRECT_URL),
      databasePoolMax: boundedInteger(env.DATABASE_POOL_MAX, defaultDatabasePoolMax, 1, 20),
      databaseConnectionTimeoutMs: boundedInteger(
        env.DATABASE_CONNECTION_TIMEOUT_MS,
        defaultDatabaseConnectionTimeoutMs,
        100,
        30_000
      ),
      databaseIdleTimeoutMs: boundedInteger(env.DATABASE_IDLE_TIMEOUT_MS, defaultDatabaseIdleTimeoutMs, 1_000, 120_000),
      internalAPIURL: nonEmpty(env.INTERNAL_API_URL),
      compatibilityDatabaseURL: nonEmpty(env.MMDC_COMPATIBILITY_DATABASE)
    },
    public: {
      siteURL: nonEmpty(env.NEXT_PUBLIC_SITE_URL)
    }
  };

  if (phase === 'build') {
    return {
      phase,
      environmentName,
      databaseMode,
      mediaStorage,
      media: {
        bucket: mediaBucket ?? 'mmdc-build-only-media',
        region: mediaRegion ?? 'mmdc-build-only-region',
        endpoint: mediaEndpoint,
        forcePathStyle: mediaForcePathStyle
      },
      required: {
        payloadSecret: snapshot.required.payloadSecret ?? buildSecret
      },
      internal: {
        ...snapshot.internal,
        databaseURL: snapshot.internal.databaseURL ?? buildDatabaseURL
      },
      public: snapshot.public
    };
  }

  const issues: string[] = [];
  if (!supportedEnvironments.has(environmentName)) issues.push('MMDC_ENVIRONMENT is unknown');
  if (!['postgres', 'neon'].includes(requestedDatabaseMode)) {
    issues.push('MMDC_DATABASE_MODE must use postgres or neon');
  }
  if (!['local', 's3'].includes(requestedMediaStorage)) {
    issues.push('MMDC_MEDIA_STORAGE must use local or s3');
  }
  if (['development', 'staging', 'production'].includes(environmentName) && requestedMediaStorage !== 's3') {
    issues.push('hosted media storage must use MMDC_MEDIA_STORAGE=s3');
  }
  if (requestedMediaStorage === 's3') {
    if (!mediaBucket) issues.push('MMDC_MEDIA_BUCKET or S3_BUCKET');
    else if (!mediaBucketHasEnvironment(mediaBucket, environmentName)) {
      issues.push('media bucket must be dedicated to MMDC_ENVIRONMENT');
    }
    if (!mediaRegion) issues.push('MMDC_MEDIA_REGION or S3_REGION');
  }
  if (environmentName === 'local' && nonEmpty(env.MMDC_MEDIA_STORAGE) && requestedMediaStorage !== 'local') {
    issues.push('local media storage must use MMDC_MEDIA_STORAGE=local');
  }
  if (!snapshot.required.payloadSecret) issues.push('PAYLOAD_SECRET');
  if (!snapshot.internal.databaseURL) issues.push('DATABASE_URL');
  if (!isURLWithProtocol(snapshot.internal.databaseURL, ['postgres:', 'postgresql:'])) {
    issues.push('DATABASE_URL must use postgres:// or postgresql://');
  }
  if (!isURLWithProtocol(snapshot.internal.databaseDirectURL, ['postgres:', 'postgresql:'])) {
    issues.push('DATABASE_DIRECT_URL must use postgres:// or postgresql://');
  }
  if (!isURLWithProtocol(snapshot.internal.internalAPIURL, ['http:', 'https:'])) {
    issues.push('INTERNAL_API_URL must use http:// or https://');
  }
  if (snapshot.internal.compatibilityDatabaseURL && !snapshot.internal.compatibilityDatabaseURL.startsWith('file:')) {
    issues.push('MMDC_COMPATIBILITY_DATABASE must use file:');
  }
  if (!isURLWithProtocol(snapshot.public.siteURL, ['http:', 'https:'])) {
    issues.push('NEXT_PUBLIC_SITE_URL must use http:// or https://');
  }

  if (issues.length > 0) throw new EnvironmentValidationError(issues);
  return snapshot;
};
