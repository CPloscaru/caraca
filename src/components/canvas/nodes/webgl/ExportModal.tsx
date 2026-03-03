'use client';

import { useCallback, useMemo, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { collectExportGraph } from '@/lib/webgl/export-graph';
import {
  generateRawWebGLHTML,
  generateThreeJSHTML,
  generateIframeSnippet,
} from '@/lib/webgl/export-templates';
import { ExportCodeView } from './ExportCodeView';
import type { FpsCap, ResolutionPreset } from '@/types/canvas';
import { RESOLUTION_PRESETS } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RenderMode = 'raw' | 'threejs';
type ExportTab = 'html' | 'iframe';

type ExportModalProps = {
  open: boolean;
  onClose: () => void;
  previewNodeId: string;
  /** Pre-fill from Preview node settings */
  initialResolution: ResolutionPreset;
  initialFpsCap: FpsCap;
  initialCustomWidth: number;
  initialCustomHeight: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResolution(
  preset: ResolutionPreset,
  customW: number,
  customH: number,
): { width: number; height: number } {
  if (preset === 'custom') return { width: customW, height: customH };
  return RESOLUTION_PRESETS[preset];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  color: '#ccc',
  fontSize: 11,
  padding: '4px 6px',
  outline: 'none',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  width: 60,
  cursor: 'text',
  textAlign: 'center',
};

const tabBaseStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 11,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  borderRadius: '4px 4px 0 0',
  transition: 'all 0.15s ease',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportModal({
  open,
  onClose,
  previewNodeId,
  initialResolution,
  initialFpsCap,
  initialCustomWidth,
  initialCustomHeight,
}: ExportModalProps) {
  // Options state
  const [resolution, setResolution] = useState<ResolutionPreset>(initialResolution);
  const [fpsCap, setFpsCap] = useState<number>(initialFpsCap);
  const [customWidth, setCustomWidth] = useState(initialCustomWidth);
  const [customHeight, setCustomHeight] = useState(initialCustomHeight);
  const [renderMode, setRenderMode] = useState<RenderMode>('raw');
  const [activeTab, setActiveTab] = useState<ExportTab>('html');

  const res = getResolution(resolution, customWidth, customHeight);

  // Collect graph and generate code
  const htmlCode = useMemo(() => {
    if (!open) return '';
    const graph = collectExportGraph(previewNodeId);
    // Override resolution/fps from modal options
    const overridden = { ...graph, width: res.width, height: res.height, fpsCap };
    return renderMode === 'raw'
      ? generateRawWebGLHTML(overridden)
      : generateThreeJSHTML(overridden);
  }, [open, previewNodeId, res.width, res.height, fpsCap, renderMode]);

  const iframeCode = useMemo(() => {
    if (!open || !htmlCode) return '';
    return generateIframeSnippet(htmlCode, res.width, res.height);
  }, [open, htmlCode, res.width, res.height]);

  const handleResolutionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setResolution(e.target.value as ResolutionPreset);
  }, []);

  const handleFpsChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFpsCap(Number(e.target.value));
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[70] bg-black/[0.85] backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200"
        />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[70] flex items-center justify-center outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200"
          aria-describedby={undefined}
        >
          <div
            style={{
              background: '#111118',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              width: 620,
              maxWidth: '92vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <DialogPrimitive.Title style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 600, margin: 0 }}>
                Exporter l&apos;animation
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  border: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 4,
                  color: '#888',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </DialogPrimitive.Close>
            </div>

            {/* Options */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                padding: '10px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                alignItems: 'center',
              }}
            >
              {/* Resolution */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#888', fontSize: 10 }}>
                Resolution
                <select value={resolution} onChange={handleResolutionChange} style={selectStyle}>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="4k">4K</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              {resolution === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(1, Number(e.target.value) || 1))}
                    style={inputStyle}
                  />
                  <span style={{ color: '#555', fontSize: 10 }}>x</span>
                  <input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(1, Number(e.target.value) || 1))}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* FPS */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#888', fontSize: 10 }}>
                FPS
                <select value={fpsCap} onChange={handleFpsChange} style={selectStyle}>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                  <option value={0}>Illimite</option>
                </select>
              </label>

              {/* Render mode */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#888', fontSize: 10 }}>
                Mode
                <select
                  value={renderMode}
                  onChange={(e) => setRenderMode(e.target.value as RenderMode)}
                  style={selectStyle}
                >
                  <option value="raw">WebGL pur</option>
                  <option value="threejs">Three.js CDN</option>
                </select>
              </label>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '8px 16px 0', gap: 2 }}>
              <button
                onClick={() => setActiveTab('html')}
                style={{
                  ...tabBaseStyle,
                  background: activeTab === 'html' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: activeTab === 'html' ? '#e5e7eb' : '#666',
                }}
              >
                HTML
              </button>
              <button
                onClick={() => setActiveTab('iframe')}
                style={{
                  ...tabBaseStyle,
                  background: activeTab === 'iframe' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: activeTab === 'iframe' ? '#e5e7eb' : '#666',
                }}
              >
                iframe
              </button>
            </div>

            {/* Code view */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
              <ExportCodeView
                code={activeTab === 'html' ? htmlCode : iframeCode}
                language="html"
              />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
