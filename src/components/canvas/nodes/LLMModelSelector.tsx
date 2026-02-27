'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Eye,
  Bot,
  ChevronRight,
} from 'lucide-react';
import { useModelSelectorState } from './shared/useModelSelectorState';
import { ModelSelectorShell } from './shared/ModelSelectorShell';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CachedLLMModel = {
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
// LLM pricing formatter
// ---------------------------------------------------------------------------

export function formatLLMPricing(
  prompt: string | null,
  completion: string | null,
): string | null {
  if (!prompt && !completion) return null;
  const pNum = prompt
    ? Math.round(parseFloat(prompt) * 1_000_000 * 100) / 100
    : 0;
  const cNum = completion
    ? Math.round(parseFloat(completion) * 1_000_000 * 100) / 100
    : 0;
  const fmt = (n: number) => {
    if (n < 0.01) return n.toFixed(3);
    if (n < 1) return n.toFixed(2);
    // Show .toFixed(2) for clean numbers like $3.00, otherwise .toFixed(1)
    const oneDecimal = n.toFixed(1);
    const twoDecimal = n.toFixed(2);
    return twoDecimal.endsWith('0') && !oneDecimal.endsWith('0')
      ? twoDecimal
      : oneDecimal.endsWith('0')
        ? twoDecimal
        : oneDecimal;
  };
  return `$${fmt(pNum)}/M in | $${fmt(cNum)}/M out`;
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
}: {
  label: string;
  models: CachedLLMModel[];
  selectedModel: string;
  onSelect: (id: string) => void;
  defaultOpen: boolean;
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
          <button
            key={m.model_id}
            className={`flex w-full items-center gap-2 px-3 py-1.5 pl-6 text-left transition-colors hover:bg-white/5 ${
              m.model_id === selectedModel ? 'bg-white/10' : ''
            }`}
            onClick={() => onSelect(m.model_id)}
          >
            <Bot className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-gray-200">
                {m.name}
              </div>
            </div>
            {m.supports_vision && (
              <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            )}
            {m.context_length != null && (
              <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                {Math.round(m.context_length / 1000)}k
              </span>
            )}
            {formatLLMPricing(m.pricing_prompt, m.pricing_completion) && (
              <span className="shrink-0 text-[10px] text-gray-500">
                {formatLLMPricing(m.pricing_prompt, m.pricing_completion)}
              </span>
            )}
          </button>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLMModelSelector
// ---------------------------------------------------------------------------

export function LLMModelSelector({ value, onSelect }: LLMModelSelectorProps) {
  const {
    open, handleOpenChange, data, loading, error,
    search, setSearch, sortByPrice, setSortByPrice, searchRef,
  } = useModelSelectorState<LLMModelsResponse>({
    fetchUrl: '/api/openrouter/models',
    transformResponse: (json) => json as LLMModelsResponse,
  });

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
    ? (filtered.flatSorted ? filtered.flatSorted.length > 0 : filtered.groups ? Object.keys(filtered.groups).length > 0 : false)
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
          {/* Price-sorted flat list */}
          {filtered.flatSorted ? (
            filtered.flatSorted.map((m) => (
              <button
                key={m.model_id}
                className={`flex w-full items-center gap-2 px-3 py-1.5 pl-4 text-left transition-colors hover:bg-white/5 ${
                  m.model_id === value ? 'bg-white/10' : ''
                }`}
                onClick={() => handleSelect(m.model_id)}
              >
                <Bot className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-gray-200">
                    {m.name}
                  </div>
                  <div className="truncate text-[10px] text-gray-600">
                    {m.provider_group}
                  </div>
                </div>
                {m.supports_vision && (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
                {formatLLMPricing(m.pricing_prompt, m.pricing_completion) && (
                  <span className="shrink-0 text-[10px] text-gray-500">
                    {formatLLMPricing(m.pricing_prompt, m.pricing_completion)}
                  </span>
                )}
              </button>
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
              />
            ))
          ) : null}
        </>
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
