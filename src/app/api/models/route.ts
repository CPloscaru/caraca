import { type NextRequest } from 'next/server';
import { createCacheRouteHandler } from '@/lib/cache/strategy';
import {
  fetchAndCacheModels,
  getCachedModels,
} from '@/lib/models/cache-warmer';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category =
    searchParams.get('category') ?? searchParams.get('mode') ?? 'text-to-image';
  const forceRefresh = searchParams.get('force_refresh') === 'true';

  const handler = createCacheRouteHandler({
    metadataKey: `models_fetched_at_${category}`,
    fetchAndCache: () => fetchAndCacheModels(category),
    getCachedData: () => getCachedModels(category),
    emptyResponse: {} as Record<string, never>,
    logPrefix: 'model-cache',
  });

  return handler({ forceRefresh });
}
