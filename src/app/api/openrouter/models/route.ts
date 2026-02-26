import { NextResponse } from 'next/server';
import {
  fetchAndCacheLLMModels,
  getLLMCacheFreshness,
  getCachedLLMModels,
} from '@/lib/openrouter/cache-warmer';

export async function GET() {
  try {
    const freshness = getLLMCacheFreshness();

    // Case 1: Cache is fresh -- return immediately
    if (freshness.isFresh) {
      const data = getCachedLLMModels();
      return NextResponse.json({
        ...data,
        cached_at: freshness.cachedAt,
        is_stale: false,
      });
    }

    // Case 2: Cache is stale -- return cached data and trigger background refresh
    if (freshness.isStale) {
      const data = getCachedLLMModels();
      // Fire-and-forget background refresh
      fetchAndCacheLLMModels().catch((err) => {
        console.warn('[llm-cache] Background refresh failed:', err.message);
      });
      return NextResponse.json({
        ...data,
        cached_at: freshness.cachedAt,
        is_stale: true,
      });
    }

    // Case 3: Cache is empty (first load) -- fetch synchronously
    await fetchAndCacheLLMModels();
    const data = getCachedLLMModels();
    const updatedFreshness = getLLMCacheFreshness();
    return NextResponse.json({
      ...data,
      cached_at: updatedFreshness.cachedAt,
      is_stale: false,
    });
  } catch (error) {
    // If fetch fails but we have cached data, return it
    const freshness = getLLMCacheFreshness();
    if (!freshness.isEmpty) {
      const data = getCachedLLMModels();
      return NextResponse.json({
        ...data,
        cached_at: freshness.cachedAt,
        is_stale: true,
      });
    }

    // No cache and fetch failed -- 503 with empty data for UI compatibility
    const message =
      error instanceof Error ? error.message : 'Failed to fetch LLM models';
    return NextResponse.json(
      { error: message, models: [], grouped: { groups: {} } },
      { status: 503 },
    );
  }
}
