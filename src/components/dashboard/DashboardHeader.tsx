'use client';

import { useRef } from 'react';
import { Search, Upload } from 'lucide-react';
import { BudgetBadges } from '@/components/budget/BudgetBadges';

type DashboardHeaderProps = {
  activeTab: 'projects' | 'templates';
  onTabChange: (tab: 'projects' | 'templates') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onImportFile?: (file: File) => void;
};

export function DashboardHeader({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onImportFile,
}: DashboardHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        padding: '16px 24px',
        flexShrink: 0,
      }}
    >
      {/* Top row: logo, search, status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <span
          style={{
            color: '#f3f4f6',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Caraca
        </span>

        {/* Search */}
        <div
          style={{
            position: 'relative',
            width: 320,
          }}
        >
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#6b7280',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              background: '#111111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              padding: '8px 12px 8px 34px',
              color: '#f3f4f6',
              fontSize: 13,
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = '#444';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a';
            }}
          />
        </div>

        {/* Import button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".caraca.json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportFile?.(file);
                // Reset so same file can be selected again
                e.target.value = '';
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #333',
              borderRadius: 6,
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = '#9ca3af';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            <Upload size={14} />
            Import
          </button>
        </div>

        {/* Budget badges */}
        <BudgetBadges />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['projects', 'templates'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            style={{
              background: activeTab === tab ? 'rgba(174, 83, 186, 0.15)' : 'transparent',
              border: activeTab === tab ? '1px solid rgba(174, 83, 186, 0.3)' : '1px solid transparent',
              color: activeTab === tab ? '#e9b5f0' : '#9ca3af',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab) {
                (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab) {
                (e.currentTarget as HTMLElement).style.color = '#9ca3af';
              }
            }}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
