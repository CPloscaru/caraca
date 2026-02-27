'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UseModelSelectorStateOptions<TData> = {
  fetchUrl: string;
  transformResponse?: (json: unknown) => TData;
  onFetched?: (data: TData) => void;
  fallbackData?: TData;
  eagerFetch?: boolean;
};

export type UseModelSelectorStateReturn<TData> = {
  open: boolean;
  handleOpenChange: (isOpen: boolean) => void;
  data: TData | null;
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (s: string) => void;
  sortByPrice: boolean;
  setSortByPrice: (v: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useModelSelectorState<TData>(
  options: UseModelSelectorStateOptions<TData>,
): UseModelSelectorStateReturn<TData> {
  const { fetchUrl, transformResponse, onFetched, fallbackData, eagerFetch } =
    options;

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortByPrice, setSortByPrice] = useState(false);

  const fetchedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Shared fetch logic -------------------------------------------------------
  const doFetch = useCallback(() => {
    fetchedRef.current = true;
    setLoading(true);
    setError(null);

    fetch(fetchUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((json: unknown) => {
        const result = transformResponse ? transformResponse(json) : (json as TData);
        setData(result);
        setLoading(false);
        if (onFetched) onFetched(result);
      })
      .catch((err) => {
        if (fallbackData) {
          setData(fallbackData);
          setLoading(false);
          if (onFetched) onFetched(fallbackData);
          return;
        }
        setError(err.message ?? 'Failed to load models');
        setLoading(false);
        fetchedRef.current = false; // allow retry
      });
  }, [fetchUrl, transformResponse, onFetched, fallbackData]);

  // Fetch on first open ------------------------------------------------------
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen && !fetchedRef.current) {
        doFetch();
      }
    },
    [doFetch],
  );

  // Eager fetch on mount (e.g. ModelSelector needs display name immediately) -
  const didEagerFetch = useRef(false);
  useEffect(() => {
    if (!eagerFetch || didEagerFetch.current || fetchedRef.current) return;
    didEagerFetch.current = true;
    doFetch();
  }, [eagerFetch, doFetch]);

  // Focus search input when popover opens; clear search on close -------------
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setSearch('');
    }
  }, [open]);

  return {
    open,
    handleOpenChange,
    data,
    loading,
    error,
    search,
    setSearch,
    sortByPrice,
    setSortByPrice,
    searchRef,
  };
}
