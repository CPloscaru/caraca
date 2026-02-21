import { create } from 'zustand';

type AppState = {
  sidebarOpen: boolean;
  settingsModalOpen: boolean;
  toggleSidebar: () => void;
  openSettings: () => void;
  closeSettings: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  settingsModalOpen: false,

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  openSettings: () => {
    set({ settingsModalOpen: true });
  },

  closeSettings: () => {
    set({ settingsModalOpen: false });
  },
}));
