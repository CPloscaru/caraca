import { NextResponse, type NextRequest } from 'next/server';
import {
  fetchAndCacheModels,
  getCacheFreshness,
  getCachedModels,
} from '@/lib/models/cache-warmer';
import { apiError } from '@/lib/api/validation';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') ?? searchParams.get('mode') ?? 'text-to-image';
  const forceRefresh = searchParams.get('force_refresh') === 'true';

  try {
    const freshness = getCacheFreshness(category);

    // Case 1: Force refresh requested
    if (forceRefresh) {
      await fetchAndCacheModels(category);
      const data = getCachedModels(category);
      const updatedFreshness = getCacheFreshness(category);
      return NextResponse.json({
        ...data,
        cached_at: updatedFreshness.cachedAt,
        is_stale: false,
      });
    }

    // Case 2: Cache is fresh — return immediately
    if (freshness.isFresh) {
      const data = getCachedModels(category);
      return NextResponse.json({
        ...data,
        cached_at: freshness.cachedAt,
        is_stale: false,
      });
    }

    // Case 3: Cache is stale — return cached data and trigger background refresh
    if (freshness.isStale) {
      const data = getCachedModels(category);
      // Fire-and-forget background refresh
      fetchAndCacheModels(category).catch((err) => {
        console.warn('[model-cache] Background refresh failed:', err.message);
      });
      return NextResponse.json({
        ...data,
        cached_at: freshness.cachedAt,
        is_stale: true,
      });
    }

    // Case 4: Cache is empty (first load) — fetch synchronously
    await fetchAndCacheModels(category);
    const data = getCachedModels(category);
    const updatedFreshness = getCacheFreshness(category);
    return NextResponse.json({
      ...data,
      cached_at: updatedFreshness.cachedAt,
      is_stale: false,
    });
  } catch (error) {
    // If fetch fails but we have cached data, return it
    const freshness = getCacheFreshness(category);
    if (!freshness.isEmpty) {
      const data = getCachedModels(category);
      return NextResponse.json({
        ...data,
        cached_at: freshness.cachedAt,
        is_stale: true,
      });
    }

    // No cache and fetch failed — 503
    const message =
      error instanceof Error ? error.message : 'Failed to fetch models';
    return apiError(503, message);
  }
}
