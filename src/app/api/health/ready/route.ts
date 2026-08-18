import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

type Readiness = {
  database: 'ok' | 'unavailable';
  search: 'ok' | 'unavailable';
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 1_000,
  idleTimeoutMillis: 5_000
});

const databaseReady = async (): Promise<boolean> => {
  if (!process.env.DATABASE_URL) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

const searchReady = async (): Promise<boolean> => {
  const baseURL = process.env.MEILISEARCH_URL?.trim();
  if (!baseURL) return false;
  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(1_000),
      cache: 'no-store'
    });
    return response.ok;
  } catch {
    return false;
  }
};

export async function GET(): Promise<Response> {
  const [database, search] = await Promise.all([databaseReady(), searchReady()]);
  const dependencies: Readiness = {
    database: database ? 'ok' : 'unavailable',
    search: search ? 'ok' : 'unavailable'
  };
  const ready = database && search;

  return Response.json(
    ready ? { status: 'ready', dependencies } : { status: 'not_ready', code: 'DEPENDENCY_UNAVAILABLE', dependencies },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } }
  );
}
