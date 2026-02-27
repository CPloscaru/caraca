'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import {
  ChevronDown,
  Eye,
  Bot,
  ChevronRight,
  Star,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useFavoritesStore } from '@/stores/favorites-store';
import { useModelSelectorState } from './shared/useModelSelectorState';
import { ModelSelectorShell } from './shared/ModelSelectorShell';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CachedLLMModel = {
  model_id: string;
  name: string;
  description: string | null;
  context_length: number | null;
  supports_vision: boolean;
  provider_group: string;
  pricing_prompt: string | null;
  pricing_completion: string | null;
};

type LLMModelsResponse = {
  models: CachedLLMModel[];
  grouped: {
    groups: Record<string, { label: string; models: CachedLLMModel[] }>;
  };
  cached_at: string | null;
  is_stale: boolean;
};

type LLMModelSelectorProps = {
  value: string;
  onSelect: (modelId: string) => void;
};

// ---------------------------------------------------------------------------
// LLM pricing formatters
// ---------------------------------------------------------------------------

/** Per-million-token price helper */
function fmt(n: number): string {
  if (n < 0.01) return n.toFixed(3);
  if (n < 1) return n.toFixed(2);
  const oneDecimal = n.toFixed(1);
  const twoDecimal = n.toFixed(2);
  return twoDecimal.endsWith('0') && !oneDecimal.endsWith('0')
    ? twoDecimal
    : oneDecimal.endsWith('0')
      ? twoDecimal
      : oneDecimal;
}

function toPerMillion(raw: string | null): number {
  return raw ? Math.round(parseFloat(raw) * 1_000_000 * 100) / 100 : 0;
}

export function formatLLMPricing(
  prompt: string | null,
  completion: string | null,
): string | null {
  if (!prompt && !completion) return null;
  return `$${fmt(toPerMillion(prompt))}/M in | $${fmt(toPerMillion(completion))}/M out`;
}

/** Compact pricing for trigger button and model rows: "$X/$Y" */
export function formatLLMPricingCompact(
  prompt: string | null,
  completion: string | null,
): string | null {
  if (!prompt && !completion) return null;
  return `$${fmt(toPerMillion(prompt))}/$${fmt(toPerMillion(completion))}`;
}

// ---------------------------------------------------------------------------
// LLM Model Details popover
// ---------------------------------------------------------------------------

export function LLMModelDetails({ model }: { model: CachedLLMModel }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="right"
          sideOffset={8}
          className="z-[60] w-64 rounded-lg border border-white/10 bg-[#1a1a1a] p-3 text-sm shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="font-medium text-gray-100">{model.name}</span>
            {model.supports_vision && (
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                Vision
              </span>
            )}
          </div>

          {model.context_length != null && (
            <div className="mb-2 text-xs text-gray-500">
              Context: {model.context_length.toLocaleString()} tokens
            </div>
          )}

          {formatLLMPricing(model.pricing_prompt, model.pricing_completion) && (
            <div className="mb-2 text-xs text-gray-500">
              {formatLLMPricing(model.pricing_prompt, model.pricing_completion)}
            </div>
          )}

          {model.description && (
            <p className="mb-2 text-xs leading-relaxed text-gray-400">
              {model.description}
            </p>
          )}

          <a
            href={`https://openrouter.ai/models/${model.model_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            View on OpenRouter
            <ExternalLink className="h-3 w-3" />
          </a>

          <PopoverPrimitive.Arrow className="fill-[#1a1a1a]" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// LLM Model Row
// ---------------------------------------------------------------------------

function LLMModelRow({
  model,
  isSelected,
  onSelect,
  isFavorited,
  isTogglingFav,
  onToggleFavorite,
}: {
  model: CachedLLMModel;
  isSelected: boolean;
  onSelect: () => void;
  isFavorited: boolean;
  isTogglingFav: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
        isSelected ? 'bg-white/10' : ''
      }`}
      onClick={onSelect}
    >
      {/* Star toggle */}
      <button
        className={`shrink-0 rounded p-1 transition-colors hover:bg-white/5 ${
          isFavorited
            ? 'text-yellow-500'
            : 'text-gray-600 hover:text-gray-400'
        }`}
        disabled={isTogglingFav}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(model.model_id);
        }}
      >
        <Star
          className="h-3.5 w-3.5"
          {...(isFavorited ? { fill: 'currentColor' } : {})}
        />
      </button>

      <Bot className="h-3.5 w-3.5 shrink-0 text-gray-500" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-gray-200">
          {model.name}
        </div>
        <div className="truncate text-[10px] text-gray-500">
          {model.provider_group}
        </div>
      </div>

      {model.supports_vision && (
        <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      )}

      {model.context_length != null && (
        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
          {Math.round(model.context_length / 1000)}k
        </span>
      )}

      {formatLLMPricingCompact(model.pricing_prompt, model.pricing_completion) && (
        <span className="shrink-0 text-[10px] text-gray-500">
          {formatLLMPricingCompact(model.pricing_prompt, model.pricing_completion)}
        </span>
      )}

      <LLMModelDetails model={model} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible provider group
// ---------------------------------------------------------------------------

function ProviderGroup({
  label,
  models,
  selectedModel,
  onSelect,
  defaultOpen,
  favoriteIds,
  toggling,
  onToggleFavorite,
}: {
  label: string;
  models: CachedLLMModel[];
  selectedModel: string;
  onSelect: (id: string) => void;
  defaultOpen: boolean;
  favoriteIds: Set<string>;
  toggling: Set<string>;
  onToggleFavorite: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:bg-white/[0.03]"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {label}
        <span className="ml-auto text-gray-600">{models.length}</span>
      </button>
      {open &&
        models.map((m) => (
          <LLMModelRow
            key={m.model_id}
            model={m}
            isSelected={m.model_id === selectedModel}
            onSelect={() => onSelect(m.model_id)}
            isFavorited={favoriteIds.has(m.model_id)}
            isTogglingFav={toggling.has(m.model_id)}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLMModelSelector
// ---------------------------------------------------------------------------

export function LLMModelSelector({ value, onSelect }: LLMModelSelectorProps) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    open, handleOpenChange, data, loading, error,
    search, setSearch, sortByPrice, setSortByPrice, searchRef,
  } = useModelSelectorState<LLMModelsResponse>({
    fetchUrl: '/api/openrouter/models',
    transformResponse: (json) => json as LLMModelsResponse,
  });

  // Favorites store
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds);
  const toggling = useFavoritesStore((s) => s.toggling);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Handle favorite toggle with toast feedback
  const handleToggleFavorite = useCallback(async (modelId: string) => {
    try {
      const result = await useFavoritesStore.getState().toggleFavorite(modelId);
      if (result.ok) {
        setToast({
          message: result.added ? 'Modele ajoute aux favoris' : 'Modele retire des favoris',
          type: 'success',
        });
      }
    } catch {
      setToast({ message: 'Erreur lors de la mise a jour', type: 'error' });
    }
  }, []);

  // Load default model on first mount if no value set
  const didLoadDefault = useRef(false);
  useEffect(() => {
    if (didLoadDefault.current) return;
    didLoadDefault.current = true;
    if (!value) {
      fetch('/api/settings/default-llm-model')
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.model) onSelect(json.model);
        })
        .catch(() => {});
    }
  }, [value, onSelect]);

  // Build favorite models list
  const favoriteModels = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    const allModelMap = new Map(data.models.map((m) => [m.model_id, m]));

    const favModels: CachedLLMModel[] = [];
    for (const id of favoriteIds) {
      const model = allModelMap.get(id);
      if (!model) continue;
      if (q && !model.name.toLowerCase().includes(q) && !model.provider_group.toLowerCase().includes(q)) continue;
      favModels.push(model);
    }
    favModels.sort((a, b) => a.name.localeCompare(b.name));
    return favModels;
  }, [data, favoriteIds, search]);

  // Filter by search (and optionally sort by price)
  const filtered = useMemo(() => {
    if (!data) return null;
    const q = search.toLowerCase();
    const filterModel = (m: CachedLLMModel) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.provider_group.toLowerCase().includes(q);

    // When sorting by price, flatten all models into a single sorted list
    if (sortByPrice) {
      const allFiltered = data.models.filter(filterModel);
      const sorted = [...allFiltered].sort((a, b) => {
        const aPrice = a.pricing_completion ? parseFloat(a.pricing_completion) : null;
        const bPrice = b.pricing_completion ? parseFloat(b.pricing_completion) : null;
        if (aPrice == null && bPrice == null) return 0;
        if (aPrice == null) return 1;
        if (bPrice == null) return -1;
        return aPrice - bPrice;
      });
      return { groups: null, flatSorted: sorted };
    }

    // Default grouped view
    if (!q) return { groups: data.grouped.groups, flatSorted: null };

    const result: Record<string, { label: string; models: CachedLLMModel[] }> =
      {};
    for (const [key, group] of Object.entries(data.grouped.groups)) {
      const fm = group.models.filter(filterModel);
      if (fm.length) result[key] = { ...group, models: fm };
    }
    return { groups: result, flatSorted: null };
  }, [data, search, sortByPrice]);

  // Find selected model name
  const selectedModel = data?.models.find((m) => m.model_id === value);
  const displayLabel = selectedModel?.name ?? (value ? value.split('/').pop() : 'Select a model...');

  const handleSelect = useCallback(
    (modelId: string) => {
      onSelect(modelId);
      handleOpenChange(false);
      // Save as default (fire-and-forget)
      fetch('/api/settings/default-llm-model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      }).catch(() => {});
    },
    [onSelect, handleOpenChange],
  );

  const hasContent = filtered
    ? (filtered.flatSorted ? filtered.flatSorted.length > 0 : filtered.groups ? Object.keys(filtered.groups).length > 0 : false) || favoriteModels.length > 0
    : false;

  return (
    <ModelSelectorShell
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <button className="nodrag nowheel flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-gray-300 transition-colors hover:border-white/20 hover:bg-white/10">
          <Bot className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className={`min-w-0 flex-1 truncate ${!value ? 'text-gray-500' : ''}`}>
            {displayLabel}
          </span>
          {selectedModel && formatLLMPricingCompact(selectedModel.pricing_prompt, selectedModel.pricing_completion) && (
            <span className="shrink-0 text-[10px] text-gray-500">
              {formatLLMPricingCompact(selectedModel.pricing_prompt, selectedModel.pricing_completion)}
            </span>
          )}
          {selectedModel?.supports_vision && (
            <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        </button>
      }
      search={search}
      onSearchChange={setSearch}
      searchRef={searchRef}
      sortByPrice={sortByPrice}
      onSortToggle={() => setSortByPrice(!sortByPrice)}
      loading={loading}
      error={error}
      hasContent={hasContent}
      emptyMessage={search ? `No models match "${search}"` : undefined}
    >
      {filtered && (
        <>
          {/* Favorites section */}
          {favoriteModels.length > 0 && !filtered.flatSorted && (
            <div>
              <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-yellow-500">
                <Star className="h-3 w-3" fill="currentColor" />
                Favoris
              </div>
              {favoriteModels.map((m) => (
                <LLMModelRow
                  key={`fav-${m.model_id}`}
                  model={m}
                  isSelected={m.model_id === value}
                  onSelect={() => handleSelect(m.model_id)}
                  isFavorited={true}
                  isTogglingFav={toggling.has(m.model_id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          )}

          {/* Price-sorted flat list */}
          {filtered.flatSorted ? (
            filtered.flatSorted.map((m) => (
              <LLMModelRow
                key={m.model_id}
                model={m}
                isSelected={m.model_id === value}
                onSelect={() => handleSelect(m.model_id)}
                isFavorited={favoriteIds.has(m.model_id)}
                isTogglingFav={toggling.has(m.model_id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))
          ) : filtered.groups ? (
            Object.entries(filtered.groups).map(([key, group]) => (
              <ProviderGroup
                key={key}
                label={group.label}
                models={group.models}
                selectedModel={value}
                onSelect={handleSelect}
                defaultOpen={!!search || group.models.some((m) => m.model_id === value)}
                favoriteIds={favoriteIds}
                toggling={toggling}
                onToggleFavorite={handleToggleFavorite}
              />
            ))
          ) : null}
        </>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={`sticky bottom-0 left-0 right-0 px-3 py-1.5 text-center text-xs rounded-b-lg ${
            toast.type === 'success'
              ? 'bg-yellow-500/15 text-yellow-300'
              : 'bg-red-500/15 text-red-300'
          }`}
        >
          {toast.message}
        </div>
      )}
    </ModelSelectorShell>
  );
}

/** Get the cached model data (for vision check). Exposed for use by LLMAssistantNode. */
export function useLLMModelData() {
  const [models, setModels] = useState<CachedLLMModel[]>([]);

  useEffect(() => {
    fetch('/api/openrouter/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: LLMModelsResponse | null) => {
        if (json?.models) setModels(json.models);
      })
      .catch(() => {});
  }, []);

  return models;
}
