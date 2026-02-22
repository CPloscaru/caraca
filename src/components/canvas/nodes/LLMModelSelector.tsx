'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import {
  ChevronDown,
  Search,
  Eye,
  Bot,
  Loader2,
  ChevronRight,
} from 'lucide-react';

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
          </button>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLMModelSelector
// ---------------------------------------------------------------------------

export function LLMModelSelector({ value, onSelect }: LLMModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LLMModelsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const fetchedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load default model on first mount if no value set
  useEffect(() => {
    if (!value) {
      fetch('/api/settings/default-llm-model')
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.model) onSelect(json.model);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch models on first open
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      setLoading(true);
      setError(null);
      fetch('/api/openrouter/models')
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })
        .then((json: LLMModelsResponse) => {
          setData(json);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message ?? 'Failed to load models');
          setLoading(false);
          fetchedRef.current = false;
        });
    }
  }, []);

  // Focus search on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setSearch('');
    }
  }, [open]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!data) return null;
    const q = search.toLowerCase();
    if (!q) return data.grouped.groups;

    const result: Record<string, { label: string; models: CachedLLMModel[] }> =
      {};
    for (const [key, group] of Object.entries(data.grouped.groups)) {
      const fm = group.models.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.provider_group.toLowerCase().includes(q),
      );
      if (fm.length) result[key] = { ...group, models: fm };
    }
    return result;
  }, [data, search]);

  // Find selected model name
  const selectedModel = data?.models.find((m) => m.model_id === value);
  const displayLabel = selectedModel?.name ?? (value ? value.split('/').pop() : 'Select a model...');

  const handleSelect = useCallback(
    (modelId: string) => {
      onSelect(modelId);
      setOpen(false);
      // Save as default (fire-and-forget)
      fetch('/api/settings/default-llm-model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      }).catch(() => {});
    },
    [onSelect],
  );

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
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
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          sideOffset={4}
          align="start"
          className="nodrag nowheel z-50 max-h-80 w-72 overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl"
        >
          {/* Search bar */}
          <div className="border-b border-white/5 p-2">
            <div className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-gray-500" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-600"
              />
            </div>
          </div>

          {/* Content */}
          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading models...
              </div>
            )}

            {error && (
              <div className="px-3 py-4 text-center text-xs text-red-400">
                Failed to load models: {error}
              </div>
            )}

            {filteredGroups && !loading && (
              <>
                {Object.entries(filteredGroups).map(([key, group]) => (
                  <ProviderGroup
                    key={key}
                    label={group.label}
                    models={group.models}
                    selectedModel={value}
                    onSelect={handleSelect}
                    defaultOpen={!!search || group.models.some((m) => m.model_id === value)}
                  />
                ))}

                {Object.keys(filteredGroups).length === 0 && (
                  <div className="py-6 text-center text-xs text-gray-500">
                    No models match &quot;{search}&quot;
                  </div>
                )}
              </>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
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
