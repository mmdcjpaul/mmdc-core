import { MeilisearchClient } from '../../../search/client.ts';
import { loadMeilisearchConfig } from '../../../search/key-policy.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  try {
    const config = loadMeilisearchConfig();
    const body = await new MeilisearchClient('search-only', config).search(`${config.indexPrefix}-foundation`, query);
    return Response.json(body);
  } catch {
    console.error(JSON.stringify({ event: 'search.unavailable', component: 'server-search-route' }));
    return Response.json(
      { status: 'degraded', code: 'SEARCH_UNAVAILABLE', results: [] },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    );
  }
}
