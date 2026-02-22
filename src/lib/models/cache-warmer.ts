import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { modelsCache, cacheMetadata } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FalModel = {
  endpoint_id: string;
  metadata?: {
    display_name?: string;
    category?: string;
    description?: string;
    thumbnail_url?: string;
    status?: string;
    kind?: string;
    group?: {
      key?: string;
      label?: string;
    };
    highlighted?: boolean;
    pinned?: boolean;
    duration_estimate?: number;
    model_url?: string;
  };
  // Legacy top-level fields (kept for backwards compatibility)
  name?: string;
  category?: string;
  description?: string;
  thumbnail_url?: string;
  model_url?: string;
};

type FalModelsResponse = {
  models?: FalModel[];
  data?: FalModel[];
  next_cursor?: string | null;
  has_more?: boolean;
};

// ---------------------------------------------------------------------------
// Core fetch + cache logic
// ---------------------------------------------------------------------------

/**
 * Fetch models from fal.ai API by category, paginating through all results,
 * and upsert them into the local SQLite cache.
 */
export async function fetchAndCacheModels(category: string): Promise<void> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.warn('[model-cache] FAL_KEY not set, skipping model fetch');
    return;
  }

  const allModels: FalModel[] = [];
  let cursor: string | null = null;

  // Paginate through all results
  do {
    const url = new URL('https://api.fal.ai/v1/models');
    url.searchParams.set('category', category);
    url.searchParams.set('limit', '50');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Key ${falKey}` },
    });

    if (!res.ok) {
      throw new Error(`fal.ai API error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as FalModelsResponse;
    const items = json.models ?? json.data ?? [];
    allModels.push(...items);
    cursor = json.next_cursor ?? null;
  } while (cursor);

  // Filter: active inference models only (FAPI-07)
  const activeModels = allModels.filter(
    (m) =>
      m.metadata?.status === 'active' && m.metadata?.kind === 'inference',
  );

  // Upsert each model into the cache
  for (const m of activeModels) {
    const meta = m.metadata;
    const displayName = meta?.display_name ?? m.name ?? m.endpoint_id;
    const cat = meta?.category ?? m.category ?? category;
    const desc = meta?.description ?? m.description ?? null;
    const thumb = meta?.thumbnail_url ?? m.thumbnail_url ?? null;
    // fal.ai API returns execution URLs (fal.run/...) — convert to model page URLs
    const rawModelUrl = meta?.model_url ?? m.model_url ?? null;
    const modelUrl = rawModelUrl?.startsWith('https://fal.run/')
      ? `https://fal.ai/models/${rawModelUrl.slice('https://fal.run/'.length)}`
      : rawModelUrl;

    db.insert(modelsCache)
      .values({
        endpoint_id: m.endpoint_id,
        category: cat,
        display_name: displayName,
        group_key: meta?.group?.key ?? null,
        group_label: meta?.group?.label ?? null,
        thumbnail_url: thumb,
        description: desc,
        highlighted: meta?.highlighted ?? false,
        pinned: meta?.pinned ?? false,
        duration_estimate: meta?.duration_estimate ?? null,
        model_url: modelUrl,
        raw_metadata: meta ? JSON.stringify(meta) : null,
      })
      .onConflictDoUpdate({
        target: modelsCache.endpoint_id,
        set: {
          category: cat,
          display_name: displayName,
          group_key: meta?.group?.key ?? null,
          group_label: meta?.group?.label ?? null,
          thumbnail_url: thumb,
          description: desc,
          highlighted: meta?.highlighted ?? false,
          pinned: meta?.pinned ?? false,
          duration_estimate: meta?.duration_estimate ?? null,
          model_url: modelUrl,
          raw_metadata: meta ? JSON.stringify(meta) : null,
        },
      })
      .run();
  }

  // Update cache metadata timestamp
  const now = Date.now();
  db.insert(cacheMetadata)
    .values({
      key: `models_fetched_at_${category}`,
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

  console.log(
    `[model-cache] Cached ${activeModels.length} ${category} models`,
  );
}

// ---------------------------------------------------------------------------
// Cache freshness check
// ---------------------------------------------------------------------------

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function getCacheFreshness(category: string): {
  isFresh: boolean;
  isStale: boolean;
  isEmpty: boolean;
  cachedAt: string | null;
} {
  const meta = db
    .select()
    .from(cacheMetadata)
    .where(eq(cacheMetadata.key, `models_fetched_at_${category}`))
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

/**
 * Get cached models from the database, grouped for the API response.
 */
export function getCachedModels(category: string) {
  const models = db
    .select()
    .from(modelsCache)
    .where(eq(modelsCache.category, category))
    .all();

  // Separate recommended models
  const recommended = models.filter((m) => m.highlighted || m.pinned);

  // Group remaining by group_key
  const groups: Record<
    string,
    { label: string; models: typeof models }
  > = {};

  for (const m of models) {
    const key = m.group_key ?? m.endpoint_id;
    const label = m.group_label ?? m.display_name;
    if (!groups[key]) {
      groups[key] = { label, models: [] };
    }
    groups[key].models.push(m);
  }

  // Sort groups alphabetically, models within groups by display_name
  const sortedGroups: typeof groups = {};
  for (const key of Object.keys(groups).sort()) {
    sortedGroups[key] = {
      ...groups[key],
      models: groups[key].models.sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    };
  }

  return {
    models,
    grouped: {
      recommended: recommended.sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
      groups: sortedGroups,
    },
  };
}
