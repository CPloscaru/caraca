'use client';

import type { SaveStatus } from '@/hooks/useAutoSave';

const statusConfig: Record<SaveStatus, { label: string; color: string; pulse: boolean }> = {
  saved: { label: 'Saved', color: '#6b7280', pulse: false },
  saving: { label: 'Saving...', color: '#eab308', pulse: true },
  unsaved: { label: 'Unsaved changes', color: '#9ca3af', pulse: false },
};

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const cfg = statusConfig[status];

  return (
    <span
      style={{
        fontSize: 12,
        color: cfg.color,
        userSelect: 'none',
        animation: cfg.pulse ? 'save-pulse 1.5s ease-in-out infinite' : undefined,
      }}
    >
      {cfg.label}
      {cfg.pulse && (
        <style>{`
          @keyframes save-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      )}
    </span>
  );
}
