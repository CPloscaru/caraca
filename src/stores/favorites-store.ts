import { create } from 'zustand';

type FavoritesState = {
  favoriteIds: Set<string>;
  loaded: boolean;
  toggling: Set<string>;

  loadFavorites: () => Promise<void>;
  toggleFavorite: (
    endpointId: string,
  ) => Promise<{ ok: boolean; added: boolean }>;
  isFavorite: (endpointId: string) => boolean;
  isToggling: (endpointId: string) => boolean;
};

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteIds: new Set<string>(),
  loaded: false,
  toggling: new Set<string>(),

  loadFavorites: async () => {
    try {
      const res = await fetch('/api/favorites');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { endpoint_ids: string[] };
      set({ favoriteIds: new Set(data.endpoint_ids), loaded: true });
    } catch (error) {
      console.error('Failed to load favorites:', error);
      set({ loaded: true });
    }
  },

  toggleFavorite: async (endpointId: string) => {
    const { toggling, favoriteIds } = get();

    if (toggling.has(endpointId)) {
      return { ok: false, added: false };
    }

    const nextToggling = new Set(toggling);
    nextToggling.add(endpointId);
    set({ toggling: nextToggling });

    const wasFav = favoriteIds.has(endpointId);

    try {
      const res = await fetch('/api/favorites', {
        method: wasFav ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint_id: endpointId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const nextFavorites = new Set(get().favoriteIds);
      if (wasFav) {
        nextFavorites.delete(endpointId);
      } else {
        nextFavorites.add(endpointId);
      }
      set({ favoriteIds: nextFavorites });

      return { ok: true, added: !wasFav };
    } finally {
      const currentToggling = new Set(get().toggling);
      currentToggling.delete(endpointId);
      set({ toggling: currentToggling });
    }
  },

  isFavorite: (endpointId: string) => get().favoriteIds.has(endpointId),

  isToggling: (endpointId: string) => get().toggling.has(endpointId),
}));
