import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceBalance = {
  amount: number | null;
  currency: string;
  lastUpdated: number | null;
  loading: boolean;
  error: boolean;
  configured: boolean;
  type: 'balance' | 'spending' | 'usage';
};

type Thresholds = {
  fal: { warning: number; critical: number };
  openRouter: { warning: number; critical: number };
};

type BudgetStore = {
  fal: ServiceBalance;
  openRouter: ServiceBalance;
  thresholds: Thresholds;

  fetchBalances: () => Promise<void>;
  fetchThresholds: () => Promise<void>;
  saveThresholds: (thresholds: Thresholds) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultBalance: ServiceBalance = {
  amount: null,
  currency: 'USD',
  lastUpdated: null,
  loading: false,
  error: false,
  configured: false,
  type: 'balance',
};

const defaultThresholds: Thresholds = {
  fal: { warning: 50, critical: 100 },
  openRouter: { warning: 5, critical: 1 },
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBudgetStore = create<BudgetStore>((set) => ({
  fal: { ...defaultBalance },
  openRouter: { ...defaultBalance },
  thresholds: { ...defaultThresholds },

  fetchBalances: async () => {
    set((s) => ({
      fal: { ...s.fal, loading: true, error: false },
      openRouter: { ...s.openRouter, loading: true, error: false },
    }));

    const [falRes, orRes] = await Promise.all([
      fetch('/api/fal/balance').then((r) => r.json()).catch(() => ({ configured: false, error: true })),
      fetch('/api/openrouter/balance').then((r) => r.json()).catch(() => ({ configured: false, error: true })),
    ]);

    const now = Date.now();

    set({
      fal: {
        amount: falRes.spent ?? null,
        currency: falRes.currency ?? 'USD',
        lastUpdated: now,
        loading: false,
        error: !!falRes.error,
        configured: !!falRes.configured,
        type: falRes.type ?? 'spending',
      },
      openRouter: {
        amount: orRes.balance ?? null,
        currency: orRes.currency ?? 'USD',
        lastUpdated: now,
        loading: false,
        error: !!orRes.error,
        configured: !!orRes.configured,
        type: orRes.type ?? 'balance',
      },
    });
  },

  fetchThresholds: async () => {
    try {
      const res = await fetch('/api/settings/budget-thresholds');
      if (res.ok) {
        const data = await res.json();
        set({ thresholds: data });
      }
    } catch {
      // Keep defaults on error
    }
  },

  saveThresholds: async (thresholds) => {
    try {
      const res = await fetch('/api/settings/budget-thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds),
      });
      if (res.ok) {
        const data = await res.json();
        set({ thresholds: data });
      }
    } catch {
      // Silently fail -- thresholds remain unchanged
    }
  },
}));
