'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import { Search, ArrowUpDown, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelSelectorShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  search: string;
  onSearchChange: (s: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  sortByPrice: boolean;
  onSortToggle: () => void;
  loading: boolean;
  error: string | null;
  hasContent: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
  popoverClassName?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelectorShell({
  open,
  onOpenChange,
  trigger,
  search,
  onSearchChange,
  searchRef,
  sortByPrice,
  onSortToggle,
  loading,
  error,
  hasContent,
  emptyMessage = 'No models match your search',
  children,
  popoverClassName,
}: ModelSelectorShellProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          sideOffset={4}
          align="start"
          className={
            popoverClassName ??
            'nodrag nowheel z-50 max-h-80 w-72 overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl'
          }
        >
          {/* Search bar + sort toggle */}
          <div className="border-b border-white/5 p-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-gray-500" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search models..."
                  className="w-full bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-600"
                />
              </div>
              <button
                className={`rounded p-1 transition-colors hover:text-gray-300 ${
                  sortByPrice ? 'text-blue-400' : 'text-gray-500'
                }`}
                onClick={onSortToggle}
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

            {!loading && !error && hasContent && children}

            {!loading && !error && !hasContent && (
              <div className="py-6 text-center text-xs text-gray-500">
                {emptyMessage}
              </div>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
