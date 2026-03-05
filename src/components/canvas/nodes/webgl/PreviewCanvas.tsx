'use client';

import type { RefObject } from 'react';
import { MonitorOff } from 'lucide-react';

type PreviewCanvasProps = {
  width: number;
  height: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  isEmpty: boolean;
  hasError?: boolean;
  errorMessage?: string;
};

export function PreviewCanvas({
  width,
  height,
  canvasRef,
  containerRef,
  isEmpty,
  hasError = false,
  errorMessage,
}: PreviewCanvasProps) {
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#0a0a0a',
      }}
    >
      {/* Canvas element — hidden during empty/error states */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: '100%',
          display: isEmpty || hasError ? 'none' : 'block',
          objectFit: 'contain',
        }}
      />

      {/* Empty state */}
      {isEmpty && !hasError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            userSelect: 'none',
          }}
        >
          <MonitorOff size={24} color="#555" />
          <span style={{ fontSize: 11, color: '#555' }}>Connect a source</span>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(220, 38, 38, 0.08)',
            padding: 12,
          }}
        >
          <span style={{ fontSize: 11, color: '#ef4444', textAlign: 'center' }}>
            {errorMessage ?? 'Render error'}
          </span>
        </div>
      )}
    </div>
  );
}
