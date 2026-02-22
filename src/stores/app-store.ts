import { create } from 'zustand';

type AppState = {
  sidebarOpen: boolean;
  settingsModalOpen: boolean;
  commandPaletteOpen: boolean;
  minimapVisible: boolean;
  toggleSidebar: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleMinimap: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  settingsModalOpen: false,
  commandPaletteOpen: false,
  minimapVisible: typeof window !== 'undefined' && localStorage.getItem('minimapVisible') === 'true',

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
}));
