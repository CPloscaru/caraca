'use client';

import { useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import type { FpsCap, ResolutionPreset } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceOption = { id: string; label: string };

type PreviewToolbarProps = {
  isPlaying: boolean;
  onTogglePlay: () => void;
  fpsCap: FpsCap;
  onFpsCapChange: (cap: FpsCap) => void;
  resolutionPreset: ResolutionPreset;
  onResolutionPresetChange: (preset: ResolutionPreset) => void;
  customWidth: number;
  customHeight: number;
  onCustomResolutionChange: (w: number, h: number) => void;
  actualFps: number;
  resolution: { width: number; height: number };
  sources: SourceOption[];
  activeSourceIndex: number;
  onActiveSourceChange: (index: number) => void;
  disabled: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewToolbar({
  isPlaying,
  onTogglePlay,
  fpsCap,
  onFpsCapChange,
  resolutionPreset,
  onResolutionPresetChange,
  customWidth,
  customHeight,
  onCustomResolutionChange,
  actualFps,
  resolution,
  sources,
  activeSourceIndex,
  onActiveSourceChange,
  disabled,
}: PreviewToolbarProps) {
  const handleFpsChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFpsCapChange(Number(e.target.value) as FpsCap);
    },
    [onFpsCapChange],
  );

  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onResolutionPresetChange(e.target.value as ResolutionPreset);
    },
    [onResolutionPresetChange],
  );

  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onActiveSourceChange(Number(e.target.value));
    },
    [onActiveSourceChange],
  );

  const handleCustomWidth = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const w = Math.max(1, Number(e.target.value) || 1);
      onCustomResolutionChange(w, customHeight);
    },
    [customHeight, onCustomResolutionChange],
  );

  const handleCustomHeight = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const h = Math.max(1, Number(e.target.value) || 1);
      onCustomResolutionChange(customWidth, h);
    },
    [customWidth, onCustomResolutionChange],
  );

  return (
    <div
      className="nodrag nowheel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        background: 'rgba(0,0,0,0.7)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        flexWrap: 'wrap',
        minHeight: 28,
      }}
    >
      {/* Play/Pause */}
      <button
        onClick={onTogglePlay}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          border: 'none',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          color: disabled ? '#444' : '#ccc',
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {isPlaying ? <Pause size={10} /> : <Play size={10} />}
      </button>

      {/* FPS cap */}
      <select
        className="nodrag nowheel"
        value={fpsCap}
        onChange={handleFpsChange}
        disabled={disabled}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          color: disabled ? '#444' : '#aaa',
          fontSize: 9,
          padding: '1px 2px',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <option value={15}>15fps</option>
        <option value={30}>30fps</option>
        <option value={60}>60fps</option>
      </select>

      {/* Resolution preset */}
      <select
        className="nodrag nowheel"
        value={resolutionPreset}
        onChange={handleResolutionChange}
        disabled={disabled}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          color: disabled ? '#444' : '#aaa',
          fontSize: 9,
          padding: '1px 2px',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <option value="720p">720p</option>
        <option value="1080p">1080p</option>
        <option value="4k">4K</option>
        <option value="custom">Custom</option>
      </select>

      {/* Custom resolution inputs */}
      {resolutionPreset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <input
            className="nodrag nowheel"
            type="number"
            value={customWidth}
            onChange={handleCustomWidth}
            disabled={disabled}
            style={{
              width: 40,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              color: '#aaa',
              fontSize: 9,
              padding: '1px 2px',
              outline: 'none',
              textAlign: 'center',
            }}
          />
          <span style={{ color: '#555', fontSize: 9 }}>x</span>
          <input
            className="nodrag nowheel"
            type="number"
            value={customHeight}
            onChange={handleCustomHeight}
            disabled={disabled}
            style={{
              width: 40,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              color: '#aaa',
              fontSize: 9,
              padding: '1px 2px',
              outline: 'none',
              textAlign: 'center',
            }}
          />
        </div>
      )}

      {/* Source switcher (only when multiple) */}
      {sources.length > 1 && (
        <select
          className="nodrag nowheel"
          value={activeSourceIndex}
          onChange={handleSourceChange}
          disabled={disabled}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 3,
            color: disabled ? '#444' : '#aaa',
            fontSize: 9,
            padding: '1px 2px',
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            maxWidth: 70,
          }}
        >
          {sources.map((s, i) => (
            <option key={s.id} value={i}>{s.label}</option>
          ))}
        </select>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Stats */}
      <span style={{ fontSize: 9, color: '#555', whiteSpace: 'nowrap' }}>
        {Math.round(actualFps)} fps | {resolution.width}x{resolution.height}
      </span>
    </div>
  );
}
