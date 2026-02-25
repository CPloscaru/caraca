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
  ArrowUpDown,
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
  unit_price: number | null;
  price_unit: string | null;
  price_currency: string | null;
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

type PricingInfo = { unitPrice: number | null; priceUnit: string | null };

type ModelSelectorProps = {
  value: string;
  onChange: (endpointId: string) => void;
  mode?: 'text-to-image' | 'image-to-image' | 'image-upscaling' | 'text-to-video' | 'image-to-video';
  onPricingInfo?: (info: PricingInfo) => void;
};

// Static upscale models — fal.ai doesn't expose a dedicated "image-upscaling" category
const STATIC_UPSCALE_MODELS: CachedModel[] = [
  {
    endpoint_id: 'fal-ai/aura-sr',
    category: 'image-upscaling',
    display_name: 'Aura SR',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'Fast 4x super-resolution. No prompt support.',
    highlighted: true, pinned: false, duration_estimate: 3,
    model_url: 'https://fal.ai/models/fal-ai/aura-sr',
    unit_price: null, price_unit: null, price_currency: null,
  },
  {
    endpoint_id: 'fal-ai/creative-upscaler',
    category: 'image-upscaling',
    display_name: 'Creative Upscaler',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'AI-guided upscaling with optional text prompt (2x–4x).',
    highlighted: true, pinned: false, duration_estimate: 15,
    model_url: 'https://fal.ai/models/fal-ai/creative-upscaler',
    unit_price: null, price_unit: null, price_currency: null,
  },
  {
    endpoint_id: 'fal-ai/esrgan',
    category: 'image-upscaling',
    display_name: 'ESRGAN',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'Classic super-resolution (2x/4x/8x). No prompt support.',
    highlighted: false, pinned: false, duration_estimate: 5,
    model_url: 'https://fal.ai/models/fal-ai/esrgan',
    unit_price: null, price_unit: null, price_currency: null,
  },
  {
    endpoint_id: 'fal-ai/clarity-upscaler',
    category: 'image-upscaling',
    display_name: 'Clarity Upscaler',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'Detail-preserving upscaling with optional prompt (2x–4x).',
    highlighted: false, pinned: false, duration_estimate: 12,
    model_url: 'https://fal.ai/models/fal-ai/clarity-upscaler',
    unit_price: null, price_unit: null, price_currency: null,
  },
];

// Static text-to-video models — fallback when fal.ai doesn't return models for this category
const STATIC_TEXT_TO_VIDEO_MODELS: CachedModel[] = [
  {
    endpoint_id: 'fal-ai/wan/v2.1/1.3b/text-to-video',
    category: 'text-to-video',
    display_name: 'Wan 2.1 1.3B',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'Fast text-to-video generation with Wan 2.1 1.3B model.',
    highlighted: true, pinned: false, duration_estimate: 30,
    model_url: 'https://fal.ai/models/fal-ai/wan/v2.1/1.3b/text-to-video',
    unit_price: null, price_unit: null, price_currency: null,
  },
  {
    endpoint_id: 'fal-ai/minimax-video/text-to-video',
    category: 'text-to-video',
    display_name: 'MiniMax Text to Video',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'High-quality text-to-video generation by MiniMax.',
    highlighted: true, pinned: false, duration_estimate: 60,
    model_url: 'https://fal.ai/models/fal-ai/minimax-video/text-to-video',
    unit_price: null, price_unit: null, price_currency: null,
  },
];

// Static image-to-video models — fallback when fal.ai doesn't return models for this category
const STATIC_IMAGE_TO_VIDEO_MODELS: CachedModel[] = [
  {
    endpoint_id: 'fal-ai/minimax-video/image-to-video',
    category: 'image-to-video',
    display_name: 'MiniMax Image to Video',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'Animate images into video with MiniMax.',
    highlighted: true, pinned: false, duration_estimate: 60,
    model_url: 'https://fal.ai/models/fal-ai/minimax-video/image-to-video',
    unit_price: null, price_unit: null, price_currency: null,
  },
  {
    endpoint_id: 'fal-ai/wan/v2.1/1.3b/image-to-video',
    category: 'image-to-video',
    display_name: 'Wan 2.1 1.3B I2V',
    group_key: null, group_label: null, thumbnail_url: null,
    description: 'Image-to-video generation with Wan 2.1 1.3B model.',
    highlighted: true, pinned: false, duration_estimate: 30,
    model_url: 'https://fal.ai/models/fal-ai/wan/v2.1/1.3b/image-to-video',
    unit_price: null, price_unit: null, price_currency: null,
  },
];

// Modes that fetch from API but fall back to static models on failure
const STATIC_FALLBACK_MODELS: Record<string, CachedModel[]> = {
  'image-upscaling': STATIC_UPSCALE_MODELS,
  'text-to-video': STATIC_TEXT_TO_VIDEO_MODELS,
  'image-to-video': STATIC_IMAGE_TO_VIDEO_MODELS,
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
          {model.unit_price != null && model.price_unit != null && (
            <div className="mb-2 text-xs text-gray-500">
              {formatFalPrice(model.unit_price, model.price_unit) ? (
                <span>{formatFalPrice(model.unit_price, model.price_unit)}</span>
              ) : (
                <span className="italic">
                  GPU pricing only: ${model.unit_price.toFixed(6)}/{model.price_unit}
                </span>
              )}
            </div>
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
// Price formatting
// ---------------------------------------------------------------------------

// Only display pricing for user-comprehensible units.
// The fal.ai pricing API returns "compute seconds" (GPU time) for some models,
// which is meaningless to end-users — hide those entirely.
const UNIT_LABELS: Record<string, string> = {
  image: '/image',
  images: '/image',
  video: '/video',
  megapixel: '/MP',
  megapixels: '/MP',
  'processed megapixels': '/MP',
};

export function formatFalPrice(unitPrice: number | null, unit: string | null): string | null {
  if (unitPrice == null || unit == null) return null;
  const label = UNIT_LABELS[unit];
  if (!label) return null;
  const formatted = unitPrice < 0.01 ? unitPrice.toFixed(4) : unitPrice.toFixed(3);
  return `$${formatted}${label}`;
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
    <div
      role="option"
      aria-selected={isSelected}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
        isSelected ? 'bg-white/10' : ''
      }`}
      onClick={onSelect}
    >
      <ModelThumb url={model.thumbnail_url} name={model.display_name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-gray-200">
          {model.display_name}
        </div>
        {model.group_label && (
          <div className="truncate text-[10px] text-gray-500">
            {model.group_label}
          </div>
        )}
      </div>
      {model.duration_estimate != null && (
        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
          ~{Math.round(model.duration_estimate)}s
        </span>
      )}
      {formatFalPrice(model.unit_price, model.price_unit) && (
        <span className="shrink-0 text-[10px] text-gray-500">
          {formatFalPrice(model.unit_price, model.price_unit)}
        </span>
      )}
      <ModelDetails model={model} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModelSelector
// ---------------------------------------------------------------------------

export function ModelSelector({ value, onChange, mode = 'text-to-image', onPricingInfo }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortByPrice, setSortByPrice] = useState(false);
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
            // Emit pricing for the currently selected model
            if (onPricingInfo && value) {
              const selected = json.models.find((m) => m.endpoint_id === value);
              if (selected) {
                onPricingInfo({ unitPrice: selected.unit_price, priceUnit: selected.price_unit });
              }
            }
          })
          .catch((err) => {
            // Fall back to static models for video modes if API fails
            const fallback = STATIC_FALLBACK_MODELS[mode];
            if (fallback) {
              const recommended = fallback.filter((m) => m.highlighted);
              const rest = fallback.filter((m) => !m.highlighted);
              setData({
                models: fallback,
                grouped: {
                  recommended,
                  groups: rest.length ? { other: { label: 'Other', models: rest } } : {},
                },
                cached_at: new Date().toISOString(),
                is_stale: true,
              });
              setLoading(false);
              return;
            }
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

  // Filter models by search (and optionally sort by price)
  const filtered = useMemo(() => {
    if (!data) return null;
    const q = search.toLowerCase();
    const filterModels = (models: CachedModel[]) =>
      q ? models.filter((m) => m.display_name.toLowerCase().includes(q)) : models;

    // When sorting by price, flatten all models into a single sorted list.
    // Only models with displayable pricing (image/video/megapixel) sort to the top;
    // models with GPU-only pricing or no pricing sort to the bottom.
    if (sortByPrice) {
      const allFiltered = filterModels(data.models);
      const sorted = [...allFiltered].sort((a, b) => {
        const aPrice = formatFalPrice(a.unit_price, a.price_unit) ? a.unit_price! : null;
        const bPrice = formatFalPrice(b.unit_price, b.price_unit) ? b.unit_price! : null;
        if (aPrice == null && bPrice == null) return 0;
        if (aPrice == null) return 1;
        if (bPrice == null) return -1;
        return aPrice - bPrice;
      });
      return { recommended: [] as CachedModel[], groups: {} as Record<string, { label: string; models: CachedModel[] }>, flatSorted: sorted };
    }

    // Default grouped view
    if (!q) return { ...data.grouped, flatSorted: null };

    const filteredGroups: Record<string, { label: string; models: CachedModel[] }> = {};
    for (const [key, group] of Object.entries(data.grouped.groups)) {
      const fm = filterModels(group.models);
      if (fm.length) filteredGroups[key] = { ...group, models: fm };
    }

    return {
      recommended: filterModels(data.grouped.recommended),
      groups: filteredGroups,
      flatSorted: null,
    };
  }, [data, search, sortByPrice]);

  // Handle model selection with pricing emission
  const handleModelSelect = useCallback(
    (model: CachedModel) => {
      onChange(model.endpoint_id);
      setOpen(false);
      if (onPricingInfo) {
        onPricingInfo({ unitPrice: model.unit_price, priceUnit: model.price_unit });
      }
    },
    [onChange, onPricingInfo],
  );

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
          {/* Search bar + sort toggle */}
          <div className="border-b border-white/5 p-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-gray-500" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-600"
                />
              </div>
              <button
                className={`rounded p-1 transition-colors hover:text-gray-300 ${
                  sortByPrice ? 'text-blue-400' : 'text-gray-500'
                }`}
                onClick={() => setSortByPrice(!sortByPrice)}
                title={sortByPrice ? 'Default order' : 'Sort by price'}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
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
                {/* Price-sorted flat list */}
                {filtered.flatSorted ? (
                  <>
                    {filtered.flatSorted.map((m) => (
                      <ModelRow
                        key={m.endpoint_id}
                        model={m}
                        isSelected={m.endpoint_id === value}
                        onSelect={() => handleModelSelect(m)}
                      />
                    ))}
                    {filtered.flatSorted.length === 0 && (
                      <div className="py-6 text-center text-xs text-gray-500">
                        No models match &quot;{search}&quot;
                      </div>
                    )}
                  </>
                ) : (
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
                            onSelect={() => handleModelSelect(m)}
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
                            onSelect={() => handleModelSelect(m)}
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
              </>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
