'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useBudgetStore } from '@/stores/budget-store';
import { useExecutionStore } from '@/stores/execution-store';

// ---------------------------------------------------------------------------
// Types (re-derive from store for local use)
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

type BadgeColor = 'normal' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeAgo(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Updated just now';
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  return `Updated ${diffH}h ago`;
}

function getBadgeColor(
  amount: number | null,
  threshold: { warning: number; critical: number },
  type: 'balance' | 'spending' | 'usage',
): BadgeColor {
  if (amount === null) return 'normal';
  if (type === 'balance') {
    // Lower balance = more critical
    if (amount <= threshold.critical) return 'critical';
    if (amount <= threshold.warning) return 'warning';
    return 'normal';
  }
  // spending / usage: higher = more critical
  if (amount >= threshold.critical) return 'critical';
  if (amount >= threshold.warning) return 'warning';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const colorStyles: Record<BadgeColor, React.CSSProperties> = {
  normal: {
    color: '#9ca3af',
    border: '1px solid #333',
    background: 'rgba(255,255,255,0.04)',
  },
  warning: {
    color: '#f59e0b',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    background: 'rgba(245, 158, 11, 0.08)',
  },
  critical: {
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    background: 'rgba(239, 68, 68, 0.08)',
  },
};

const notConfiguredStyle: React.CSSProperties = {
  color: '#6b7280',
  opacity: 0.6,
  border: '1px solid #333',
  background: 'rgba(255,255,255,0.04)',
};

const pillBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'default',
};

// ---------------------------------------------------------------------------
// Tooltip builders
// ---------------------------------------------------------------------------

function buildFalTooltip(service: ServiceBalance): string {
  const timeInfo = getTimeAgo(service.lastUpdated);
  if (!service.configured) return 'fal.ai: API key not configured';
  return `Credits spent (30d) \u2014 remaining balance not available via fal.ai API\n${timeInfo}`;
}

function buildOpenRouterTooltip(service: ServiceBalance): string {
  const timeInfo = getTimeAgo(service.lastUpdated);
  if (!service.configured) return 'OpenRouter: API key not configured';
  return `Remaining credits\n${timeInfo}`;
}

// ---------------------------------------------------------------------------
// BudgetPill (internal)
// ---------------------------------------------------------------------------

function BudgetPill({
  label,
  service,
  thresholds,
  tooltip,
}: {
  label: string;
  service: ServiceBalance;
  thresholds: { warning: number; critical: number };
  tooltip: string;
}) {
  if (!service.configured) {
    return (
      <span style={{ ...pillBase, ...notConfiguredStyle }} title={tooltip}>
        {label}: Not configured
      </span>
    );
  }

  if (service.loading) {
    return (
      <span style={{ ...pillBase, ...colorStyles.normal }} title={tooltip}>
        {label}: ...
      </span>
    );
  }

  if (service.error) {
    return (
      <span style={{ ...pillBase, ...colorStyles.normal }} title={tooltip}>
        {label}: ?
      </span>
    );
  }

  const color = getBadgeColor(service.amount, thresholds, service.type);

  let text: string;
  if (service.type === 'spending') {
    text = `${label}: $${service.amount?.toFixed(2)} spent`;
  } else if (service.type === 'usage') {
    text = `${label}: $${service.amount?.toFixed(2)} used`;
  } else if (service.amount !== null) {
    text = `${label}: $${service.amount?.toFixed(2)}`;
  } else {
    text = `${label}: N/A`;
  }

  return (
    <span style={{ ...pillBase, ...colorStyles[color] }} title={tooltip}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BudgetBadges (exported)
// ---------------------------------------------------------------------------

export function BudgetBadges() {
  const fal = useBudgetStore((s) => s.fal);
  const openRouter = useBudgetStore((s) => s.openRouter);
  const thresholds = useBudgetStore((s) => s.thresholds);
  const fetchBalances = useBudgetStore((s) => s.fetchBalances);
  const isRunning = useExecutionStore((s) => s.isRunning);
  const prevRunningRef = useRef(false);

  // Initial fetch on mount
  useEffect(() => {
    const store = useBudgetStore.getState();
    store.fetchBalances();
    store.fetchThresholds();
  }, []);

  // Post-execution refresh: when isRunning transitions true -> false
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      const timer = setTimeout(() => {
        useBudgetStore.getState().fetchBalances();
      }, 1500);
      return () => clearTimeout(timer);
    }
    prevRunningRef.current = isRunning;
  }, [isRunning]);

  const anyLoading = fal.loading || openRouter.loading;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <BudgetPill
        label="fal.ai"
        service={fal}
        thresholds={thresholds.fal}
        tooltip={buildFalTooltip(fal)}
      />
      <BudgetPill
        label="OpenRouter"
        service={openRouter}
        thresholds={thresholds.openRouter}
        tooltip={buildOpenRouterTooltip(openRouter)}
      />
      <button
        onClick={() => fetchBalances()}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#9ca3af',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#9ca3af';
        }}
        title="Refresh balances"
      >
        <RefreshCw
          size={12}
          style={{
            animation: anyLoading ? 'spin 1s linear infinite' : 'none',
          }}
        />
      </button>
    </div>
  );
}
