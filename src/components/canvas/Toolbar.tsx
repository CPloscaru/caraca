'use client';

import { PanelLeft, Settings } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

export function Toolbar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const openSettings = useAppStore((s) => s.openSettings);

  return (
    <div
      style={{
        height: 48,
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={toggleSidebar}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s ease, background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
            (e.currentTarget as HTMLElement).style.background =
              'rgba(174, 83, 186, 0.12)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#9ca3af';
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          title="Toggle sidebar"
        >
          <PanelLeft size={20} />
        </button>
        <span
          style={{
            color: '#f3f4f6',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          Caraca
        </span>
      </div>

      <button
        onClick={openSettings}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#9ca3af',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease, background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
          (e.currentTarget as HTMLElement).style.background =
            'rgba(174, 83, 186, 0.12)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#9ca3af';
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
        title="Settings"
      >
        <Settings size={20} />
      </button>
    </div>
  );
}
