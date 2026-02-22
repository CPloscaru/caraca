'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import {
  ChevronDown,
  Search,
  Star,
  Info,
  Clock,
  ExternalLink,
  ImageIcon,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CachedModel = {
  endpoint_id: string;
  category: string;
  display_name: string;
  group_key: string | null;
  group_label: string | null;
  thumbnail_url: string | null;
  description: string | null;
  highlighted: boolean | null;
  pinned: boolean | null;
  duration_estimate: number | null;
  model_url: string | null;
};

type ModelsResponse = {
  models: CachedModel[];
  grouped: {
    recommended: CachedModel[];
    groups: Record<string, { label: string; models: CachedModel[] }>;
  };
  cached_at: string | null;
  is_stale: boolean;
};

type ModelSelectorProps = {
  value: string;
  onChange: (endpointId: string) => void;
  mode?: 'text-to-image' | 'image-to-image' | 'image-upscaling';
};

// ---------------------------------------------------------------------------
// Model thumbnail component
// ---------------------------------------------------------------------------

function ModelThumb({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/5">
        <ImageIcon className="h-4 w-4 text-gray-500" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className="h-8 w-8 shrink-0 rounded object-cover"
      loading="lazy"
    />
  );
}

// ---------------------------------------------------------------------------
// Model details popover (secondary)
// ---------------------------------------------------------------------------

function ModelDetails({ model }: { model: CachedModel }) {
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
          <div className="mb-2 font-medium text-gray-100">
            {model.display_name}
          </div>
          {model.description && (
            <p className="mb-2 text-xs leading-relaxed text-gray-400">
              {model.description}
            </p>
          )}
          {model.duration_estimate != null && (
            <div className="mb-2 flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              <span>~{Math.round(model.duration_estimate)}s</span>
            </div>
          )}
          {model.model_url && (
            <a
              href={model.model_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
            >
              View on fal.ai
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <PopoverPrimitive.Arrow className="fill-[#1a1a1a]" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Model row
// ---------------------------------------------------------------------------

function ModelRow({
  model,
  isSelected,
  onSelect,
}: {
  model: CachedModel;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
        isSelected ? 'bg-white/10' : ''
      }`}
      onClick={onSelect}
    >
      <ModelThumb url={model.thumbnail_url} name={model.display_name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-gray-200">
          {model.display_name}
        </div>
      </div>
      {model.duration_estimate != null && (
        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
          ~{Math.round(model.duration_estimate)}s
        </span>
      )}
      <ModelDetails model={model} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ModelSelector
// ---------------------------------------------------------------------------

export function ModelSelector({ value, onChange, mode = 'text-to-image' }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const fetchedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch models on first open
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen && !fetchedRef.current) {
        fetchedRef.current = true;
        setLoading(true);
        setError(null);
        fetch(`/api/models?mode=${mode}`)
          .then((r) => {
            if (!r.ok) throw new Error(`${r.status}`);
            return r.json();
          })
          .then((json: ModelsResponse) => {
            setData(json);
            setLoading(false);
          })
          .catch((err) => {
            setError(err.message ?? 'Failed to load models');
            setLoading(false);
            fetchedRef.current = false; // allow retry
          });
      }
    },
    [mode],
  );

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setSearch('');
    }
  }, [open]);

  // Filter models by search
  const filtered = useMemo(() => {
    if (!data) return null;
    const q = search.toLowerCase();
    if (!q) return data.grouped;

    const filterModels = (models: CachedModel[]) =>
      models.filter((m) => m.display_name.toLowerCase().includes(q));

    const filteredGroups: Record<string, { label: string; models: CachedModel[] }> = {};
    for (const [key, group] of Object.entries(data.grouped.groups)) {
      const fm = filterModels(group.models);
      if (fm.length) filteredGroups[key] = { ...group, models: fm };
    }

    return {
      recommended: filterModels(data.grouped.recommended),
      groups: filteredGroups,
    };
  }, [data, search]);

  // Find the currently selected model name
  const selectedModel = data?.models.find((m) => m.endpoint_id === value);
  const displayLabel = selectedModel?.display_name ?? value.split('/').pop() ?? 'Select model';

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button className="nodrag nowheel flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-gray-300 transition-colors hover:border-white/20 hover:bg-white/10">
          {selectedModel?.thumbnail_url ? (
            <img
              src={selectedModel.thumbnail_url}
              alt=""
              className="h-5 w-5 shrink-0 rounded object-cover"
            />
          ) : (
            <ImageIcon className="h-4 w-4 shrink-0 text-gray-500" />
          )}
          <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
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

            {filtered && !loading && (
              <>
                {/* Recommended section */}
                {filtered.recommended.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-yellow-500/80">
                      <Star className="h-3 w-3" />
                      Recommended
                    </div>
                    {filtered.recommended.map((m) => (
                      <ModelRow
                        key={m.endpoint_id}
                        model={m}
                        isSelected={m.endpoint_id === value}
                        onSelect={() => {
                          onChange(m.endpoint_id);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Grouped models */}
                {Object.entries(filtered.groups).map(([key, group]) => (
                  <div key={key}>
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {group.label}
                    </div>
                    {group.models.map((m) => (
                      <ModelRow
                        key={m.endpoint_id}
                        model={m}
                        isSelected={m.endpoint_id === value}
                        onSelect={() => {
                          onChange(m.endpoint_id);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </div>
                ))}

                {/* Empty search results */}
                {filtered.recommended.length === 0 &&
                  Object.keys(filtered.groups).length === 0 && (
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
