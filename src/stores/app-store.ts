import { create } from 'zustand';

type AppState = {
  sidebarOpen: boolean;
  settingsModalOpen: boolean;
  commandPaletteOpen: boolean;
  minimapVisible: boolean;
  schemaLoadingCount: number;
  toggleSidebar: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleMinimap: () => void;
  startSchemaLoading: () => void;
  stopSchemaLoading: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  settingsModalOpen: false,
  commandPaletteOpen: false,
  minimapVisible: typeof window !== 'undefined' && localStorage.getItem('minimapVisible') === 'true',
  schemaLoadingCount: 0,

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  openSettings: () => {
    set({ settingsModalOpen: true });
  },

  closeSettings: () => {
    set({ settingsModalOpen: false });
  },

  openCommandPalette: () => {
    set({ commandPaletteOpen: true });
  },

  closeCommandPalette: () => {
    set({ commandPaletteOpen: false });
  },

  toggleMinimap: () => {
    set((state) => {
      const next = !state.minimapVisible;
      localStorage.setItem('minimapVisible', String(next));
      return { minimapVisible: next };
    });
  },

  startSchemaLoading: () => {
    set((state) => ({ schemaLoadingCount: state.schemaLoadingCount + 1 }));
  },
  stopSchemaLoading: () => {
    set((state) => ({ schemaLoadingCount: Math.max(0, state.schemaLoadingCount - 1) }));
  },
}));
