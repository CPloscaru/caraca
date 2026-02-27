import { db } from '@/lib/db';
import { llmModelsCache } from '@/lib/db/schema';
import { getCacheFreshness, updateCacheTimestamp } from '@/lib/cache/strategy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

type OpenRouterModelsResponse = {
  data: OpenRouterModel[];
};

// ---------------------------------------------------------------------------
// Core fetch + cache logic
// ---------------------------------------------------------------------------

/**
 * Fetch models from OpenRouter API and upsert into the local SQLite cache.
 */
export async function fetchAndCacheLLMModels(): Promise<void> {
  const key = process.env.OPENROUTER_KEY;
  if (!key) {
    console.warn('[llm-cache] OPENROUTER_KEY not set, skipping model fetch');
    return;
  }

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    throw new Error(`OpenRouter API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as OpenRouterModelsResponse;

  // Filter to chat-capable models (text in + text out)
  const chatModels = json.data.filter((m) => {
    const inputMods = m.architecture?.input_modalities ?? [];
    const outputMods = m.architecture?.output_modalities ?? [];
    return inputMods.includes('text') && outputMods.includes('text');
  });

  // Upsert each model into the cache
  for (const m of chatModels) {
    const providerGroup = m.id.includes('/') ? m.id.split('/')[0] : m.id;
    const supportsVision = m.architecture?.input_modalities?.includes('image') ?? false;

    db.insert(llmModelsCache)
      .values({
        model_id: m.id,
        name: m.name,
        description: m.description ?? null,
        context_length: m.context_length ?? null,
        supports_vision: supportsVision,
        provider_group: providerGroup,
        pricing_prompt: m.pricing?.prompt ?? null,
        pricing_completion: m.pricing?.completion ?? null,
        raw_metadata: JSON.stringify(m),
      })
      .onConflictDoUpdate({
        target: llmModelsCache.model_id,
        set: {
          name: m.name,
          description: m.description ?? null,
          context_length: m.context_length ?? null,
          supports_vision: supportsVision,
          provider_group: providerGroup,
          pricing_prompt: m.pricing?.prompt ?? null,
          pricing_completion: m.pricing?.completion ?? null,
          raw_metadata: JSON.stringify(m),
        },
      })
      .run();
  }

  // Update cache metadata timestamp
  updateCacheTimestamp('llm_models_fetched_at');

  console.log(`[llm-cache] Cached ${chatModels.length} LLM models`);
}

// ---------------------------------------------------------------------------
// Cache freshness check (thin wrapper over shared strategy)
// ---------------------------------------------------------------------------

export function getLLMCacheFreshness() {
  return getCacheFreshness('llm_models_fetched_at');
}

// ---------------------------------------------------------------------------
// Get cached models, grouped by provider
// ---------------------------------------------------------------------------

export function getCachedLLMModels() {
  const models = db.select().from(llmModelsCache).all();

  // Group by provider_group alphabetically
  const groups: Record<string, { label: string; models: typeof models }> = {};

  for (const m of models) {
    const key = m.provider_group;
    if (!groups[key]) {
      groups[key] = { label: key, models: [] };
    }
    groups[key].models.push(m);
  }

  // Sort groups alphabetically, models within groups by name
  const sortedGroups: typeof groups = {};
  for (const key of Object.keys(groups).sort()) {
    sortedGroups[key] = {
      ...groups[key],
      models: groups[key].models.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  return {
    models,
    grouped: { groups: sortedGroups },
  };
}
