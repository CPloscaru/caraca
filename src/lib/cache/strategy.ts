import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cacheMetadata } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CacheFreshness = {
  isFresh: boolean;
  isStale: boolean;
  isEmpty: boolean;
  cachedAt: string | null;
};

export type CacheRouteConfig<T> = {
  metadataKey: string;
  fetchAndCache: () => Promise<void>;
  getCachedData: () => T;
  emptyResponse: T;
  logPrefix: string;
};

// ---------------------------------------------------------------------------
// getCacheFreshness — generic cache freshness check
// ---------------------------------------------------------------------------

/**
 * Query the cacheMetadata table for the given key and return freshness info.
 * Returns isEmpty=true if no row exists, isFresh/isStale based on SIX_HOURS_MS.
 */
export function getCacheFreshness(metadataKey: string): CacheFreshness {
  const meta = db
    .select()
    .from(cacheMetadata)
    .where(eq(cacheMetadata.key, metadataKey))
    .get();

  if (!meta) {
    return { isFresh: false, isStale: false, isEmpty: true, cachedAt: null };
  }

  const age = Date.now() - meta.updated_at;
  return {
    isFresh: age < SIX_HOURS_MS,
    isStale: age >= SIX_HOURS_MS,
    isEmpty: false,
    cachedAt: meta.value,
  };
}

// ---------------------------------------------------------------------------
// updateCacheTimestamp — upsert cache metadata timestamp
// ---------------------------------------------------------------------------

/**
 * Upsert a cacheMetadata row with the current timestamp for the given key.
 */
export function updateCacheTimestamp(metadataKey: string): void {
  const now = Date.now();
  db.insert(cacheMetadata)
    .values({
      key: metadataKey,
      value: new Date(now).toISOString(),
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: cacheMetadata.key,
      set: {
        value: new Date(now).toISOString(),
        updated_at: now,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// createCacheRouteHandler — factory for cache-aware API route handlers
// ---------------------------------------------------------------------------

/**
 * Creates an async handler implementing the 4-case cache strategy:
 * 1. forceRefresh: await fetch, return fresh data
 * 2. isFresh: return cached data immediately
 * 3. isStale: return cached data + fire-and-forget background refresh
 * 4. isEmpty: await fetch synchronously, return data
 *
 * Error fallback: return cached data as stale if available, otherwise 503.
 */
export function createCacheRouteHandler<T>(config: CacheRouteConfig<T>) {
  const { metadataKey, fetchAndCache, getCachedData, emptyResponse, logPrefix } = config;

  return async (options?: { forceRefresh?: boolean }): Promise<NextResponse> => {
    try {
      const freshness = getCacheFreshness(metadataKey);

      // Case 1: Force refresh requested
      if (options?.forceRefresh) {
        await fetchAndCache();
        const data = getCachedData();
        const updatedFreshness = getCacheFreshness(metadataKey);
        return NextResponse.json({
          ...data,
          cached_at: updatedFreshness.cachedAt,
          is_stale: false,
        });
      }

      // Case 2: Cache is fresh -- return immediately
      if (freshness.isFresh) {
        const data = getCachedData();
        return NextResponse.json({
          ...data,
          cached_at: freshness.cachedAt,
          is_stale: false,
        });
      }

      // Case 3: Cache is stale -- return cached data + background refresh
      if (freshness.isStale) {
        const data = getCachedData();
        fetchAndCache().catch((err) => {
          console.warn(`[${logPrefix}] Background refresh failed:`, err.message);
        });
        return NextResponse.json({
          ...data,
          cached_at: freshness.cachedAt,
          is_stale: true,
        });
      }

      // Case 4: Cache is empty (first load) -- fetch synchronously
      await fetchAndCache();
      const data = getCachedData();
      const updatedFreshness = getCacheFreshness(metadataKey);
      return NextResponse.json({
        ...data,
        cached_at: updatedFreshness.cachedAt,
        is_stale: false,
      });
    } catch (error) {
      // If fetch fails but we have cached data, return it as stale
      const freshness = getCacheFreshness(metadataKey);
      if (!freshness.isEmpty) {
        const data = getCachedData();
        return NextResponse.json({
          ...data,
          cached_at: freshness.cachedAt,
          is_stale: true,
        });
      }

      // No cache and fetch failed -- 503
      const message =
        error instanceof Error ? error.message : 'Failed to fetch data';
      return NextResponse.json(
        { error: message, ...emptyResponse },
        { status: 503 },
      );
    }
  };
}
