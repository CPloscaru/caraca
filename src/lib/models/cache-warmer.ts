import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { modelsCache } from '@/lib/db/schema';
import {
  getCacheFreshness as getGenericCacheFreshness,
  updateCacheTimestamp,
} from '@/lib/cache/strategy';

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

// Gallery API response shape (fal.ai/api/models — different from Platform API)
type GalleryModel = {
  id: string;
  title: string;
  category: string;
  tags?: string[];
  shortDescription?: string;
  thumbnailUrl?: string;
  modelUrl?: string;
  highlighted?: boolean;
  kind?: string;
  group?: { key?: string; label?: string };
  deprecated?: boolean;
  removed?: boolean;
  unlisted?: boolean;
};

type GalleryResponse = {
  items: GalleryModel[];
  total: number;
  page: number;
  pages: number;
};

// ---------------------------------------------------------------------------
// Core fetch + cache logic
// ---------------------------------------------------------------------------

// Categories that use fal.ai Gallery API (tags-based) instead of Platform API
const GALLERY_TAG_CATEGORIES: Record<string, string> = {
  'image-upscaling': 'upscaling',
};

/**
 * Fetch models from fal.ai Gallery API by tag, paginating through all pages.
 * Used for categories that don't exist in the Platform API (e.g. image-upscaling).
 */
async function fetchFromGallery(tag: string): Promise<FalModel[]> {
  const allModels: FalModel[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = new URL('https://fal.ai/api/models');
    url.searchParams.set('tags', tag);
    url.searchParams.set('limit', '50');
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`fal.ai gallery API error: ${res.status}`);

    const json = (await res.json()) as GalleryResponse;
    totalPages = json.pages;

    for (const gm of json.items) {
      if (gm.deprecated || gm.removed || gm.unlisted) continue;
      // Convert gallery shape to our FalModel shape
      const rawModelUrl = gm.modelUrl ?? null;
      allModels.push({
        endpoint_id: gm.id,
        metadata: {
          display_name: gm.title,
          category: gm.category,
          description: gm.shortDescription,
          thumbnail_url: gm.thumbnailUrl,
          status: 'active',
          kind: gm.kind ?? 'inference',
          group: gm.group,
          highlighted: gm.highlighted,
          model_url: rawModelUrl ?? undefined,
        },
      });
    }
    page++;
  } while (page <= totalPages);

  return allModels;
}

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

  let activeModels: FalModel[];

  // Use Gallery API for tag-based categories (e.g. image-upscaling)
  const galleryTag = GALLERY_TAG_CATEGORIES[category];
  if (galleryTag) {
    activeModels = await fetchFromGallery(galleryTag);
  } else {
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
    activeModels = allModels.filter(
      (m) =>
        m.metadata?.status === 'active' && m.metadata?.kind === 'inference',
    );
  }

  // Upsert each model into the cache
  // For gallery-fetched models, override category to our internal name
  const overrideCategory = galleryTag ? category : null;
  for (const m of activeModels) {
    const meta = m.metadata;
    const displayName = meta?.display_name ?? m.name ?? m.endpoint_id;
    const cat = overrideCategory ?? meta?.category ?? m.category ?? category;
    const desc = meta?.description ?? m.description ?? null;
    const rawThumb = meta?.thumbnail_url ?? m.thumbnail_url ?? null;
    // Filter out blob: URLs — they are local to fal.ai's browser and unusable here
    const thumb = rawThumb?.startsWith('blob:') ? null : rawThumb;
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
  updateCacheTimestamp(`models_fetched_at_${category}`);

  console.log(
    `[model-cache] Cached ${activeModels.length} ${category} models`,
  );

  // Fetch and cache pricing data (non-blocking — failures don't affect model cache)
  try {
    const endpointIds = activeModels.map((m) => m.endpoint_id);
    await fetchAndCachePricing(endpointIds);
  } catch (err) {
    console.warn(
      '[model-cache] Pricing fetch failed (non-blocking):',
      err instanceof Error ? err.message : err,
    );
  }
}

// ---------------------------------------------------------------------------
// Pricing fetch
// ---------------------------------------------------------------------------

type PricingEntry = {
  endpoint_id: string;
  unit_price?: number;
  unit?: string;
  currency?: string;
};

type PricingResponse = {
  prices?: PricingEntry[];
};

/**
 * Fetch pricing from fal.ai pricing API for the given endpoint_ids
 * and update the corresponding modelsCache rows. Gracefully handles
 * missing FAL_KEY, API errors, and partial results.
 */
async function fetchAndCachePricing(endpointIds: string[]): Promise<void> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) return;
  if (endpointIds.length === 0) return;

  // Batch in groups of 50 (API limit)
  for (let i = 0; i < endpointIds.length; i += 50) {
    const batch = endpointIds.slice(i, i + 50);
    const url = new URL('https://api.fal.ai/v1/models/pricing');
    url.searchParams.set('endpoint_id', batch.join(','));

    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Key ${falKey}` },
      });

      if (!res.ok) {
        console.warn(
          `[model-cache] Pricing API returned ${res.status} for batch starting at index ${i}`,
        );
        continue;
      }

      const json = (await res.json()) as PricingResponse;
      const prices = json.prices ?? [];

      for (const price of prices) {
        if (price.unit_price == null || !price.endpoint_id) continue;
        db.update(modelsCache)
          .set({
            unit_price: price.unit_price,
            price_unit: price.unit ?? null,
            price_currency: price.currency ?? 'USD',
          })
          .where(eq(modelsCache.endpoint_id, price.endpoint_id))
          .run();
      }

      console.log(
        `[model-cache] Updated pricing for ${prices.length} models (batch ${Math.floor(i / 50) + 1})`,
      );
    } catch (err) {
      console.warn(
        `[model-cache] Pricing batch ${Math.floor(i / 50) + 1} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cache freshness check (thin wrapper over shared strategy)
// ---------------------------------------------------------------------------

export function getCacheFreshness(category: string) {
  return getGenericCacheFreshness(`models_fetched_at_${category}`);
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

  // Group non-recommended by group_key (avoid duplicates with recommended section)
  const groups: Record<
    string,
    { label: string; models: typeof models }
  > = {};

  const nonRecommended = models.filter((m) => !m.highlighted && !m.pinned);
  for (const m of nonRecommended) {
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
