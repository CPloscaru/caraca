'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, NodeResizer, Position, useEdges, useUpdateNodeInternals } from '@xyflow/react';
import { Monitor } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { useWebGLPreview } from '@/hooks/use-webgl-preview';
import { PreviewCanvas } from './PreviewCanvas';
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewFullscreenModal } from './PreviewFullscreenModal';
import { ExportModal } from './ExportModal';
import { getWebGLOutput } from '@/lib/webgl/output-map';
import { emitMouseEvent } from '@/lib/mouse-event-bus';
import type {
  FpsCap,
  ResolutionPreset,
  WebGLPreviewData,
} from '@/types/canvas';
import { RESOLUTION_PRESETS } from '@/types/canvas';

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
// Component
// ---------------------------------------------------------------------------

function WebGLPreviewNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as WebGLPreviewData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();

  // Force React Flow to recalculate handle bounds after dynamic mount.
  // webglDynamic (next/dynamic ssr:false) loads this component after React Flow
  // has already measured the node, and the Handle is position:absolute so it
  // doesn't trigger a ResizeObserver update.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  // Node data with defaults
  const fpsCap: FpsCap = d.fpsCap ?? 30;
  const resolutionPreset: ResolutionPreset = d.resolutionPreset ?? '720p';
  const customWidth = d.customWidth ?? 1280;
  const customHeight = d.customHeight ?? 720;
  const isPlaying = d.isPlaying ?? false;
  const activeSourceIndex = d.activeSourceIndex ?? 0;

  const resolution = getResolution(resolutionPreset, customWidth, customHeight);

  // Determine connected sources from edges targeting this node's webgl input
  const connectedSources = useMemo(() => {
    return edges
      .filter(
        (e) =>
          e.target === id &&
          e.targetHandle?.startsWith('webgl-'),
      )
      .map((e) => ({
        key: `${e.source}:${e.sourceHandle}`,
        label: `Source ${e.source.slice(-4)}`,
        edgeId: e.id,
      }));
  }, [edges, id]);

  const isEmpty = connectedSources.length === 0;

  // Clamp active source index
  const safeIndex = Math.min(activeSourceIndex, Math.max(0, connectedSources.length - 1));
  const activeSource = connectedSources[safeIndex] ?? null;
  const activeSourceKey = activeSource?.key ?? null;

  // Actual FPS display (read from ref periodically)
  const [displayFps, setDisplayFps] = useState(0);

  const { canvasRef, containerRef, actualFps } = useWebGLPreview({
    nodeId: id,
    isPlaying: isPlaying && !isEmpty,
    fpsCap,
    activeSourceKey,
    getOutput: getWebGLOutput,
  });

  // Update display FPS every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFps(actualFps.current);
    }, 500);
    return () => clearInterval(interval);
  }, [actualFps]);

  // Auto-start: when a valid source connects and not already playing
  const prevSourceCountRef = useRef(connectedSources.length);
  useEffect(() => {
    const prev = prevSourceCountRef.current;
    prevSourceCountRef.current = connectedSources.length;
    if (prev === 0 && connectedSources.length > 0 && !isPlaying) {
      updateNodeData(id, { isPlaying: true });
    }
    // Reset to empty when disconnected
    if (connectedSources.length === 0 && isPlaying) {
      updateNodeData(id, { isPlaying: false });
    }
  }, [connectedSources.length, id, isPlaying, updateNodeData]);

  // Fullscreen modal state
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false);

  const handleDoubleClick = useCallback(() => {
    if (!isEmpty) setFullscreenOpen(true);
  }, [isEmpty]);

  // Toolbar callbacks
  const handleTogglePlay = useCallback(() => {
    updateNodeData(id, { isPlaying: !isPlaying });
  }, [id, isPlaying, updateNodeData]);

  const handleFpsCapChange = useCallback(
    (cap: FpsCap) => {
      updateNodeData(id, { fpsCap: cap });
    },
    [id, updateNodeData],
  );

  const handleResolutionChange = useCallback(
    (preset: ResolutionPreset) => {
      updateNodeData(id, { resolutionPreset: preset });
    },
    [id, updateNodeData],
  );

  const handleCustomResolution = useCallback(
    (w: number, h: number) => {
      updateNodeData(id, { customWidth: w, customHeight: h });
    },
    [id, updateNodeData],
  );

  const handleActiveSourceChange = useCallback(
    (index: number) => {
      updateNodeData(id, { activeSourceIndex: index });
    },
    [id, updateNodeData],
  );

  const sourceOptions = useMemo(
    () => connectedSources.map((s) => ({ id: s.key, label: s.label })),
    [connectedSources],
  );

  const toolbar = (
    <PreviewToolbar
      isPlaying={isPlaying}
      onTogglePlay={handleTogglePlay}
      onExport={() => setExportOpen(true)}
      fpsCap={fpsCap}
      onFpsCapChange={handleFpsCapChange}
      resolutionPreset={resolutionPreset}
      onResolutionPresetChange={handleResolutionChange}
      customWidth={customWidth}
      customHeight={customHeight}
      onCustomResolutionChange={handleCustomResolution}
      actualFps={displayFps}
      resolution={resolution}
      sources={sourceOptions}
      activeSourceIndex={safeIndex}
      onActiveSourceChange={handleActiveSourceChange}
      disabled={isEmpty}
    />
  );

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        background: '#111',
        border: `1px solid ${selected ? 'transparent' : '#222'}`,
        borderRadius: 8,
        minWidth: 200,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected
          ? '0 0 0 2px #ff6b35, 0 0 12px rgba(255, 107, 53, 0.3)'
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={140}
        isVisible={!!selected}
        keepAspectRatio={true}
        lineStyle={{ borderColor: '#ff6b35' }}
        handleStyle={{ backgroundColor: '#ff6b35', width: 8, height: 8 }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          background: 'rgba(0,0,0,0.4)',
          userSelect: 'none',
        }}
      >
        <Monitor size={12} color="#ff6b35" />
        <span style={{ color: '#e5e7eb', fontSize: 11, fontWeight: 500 }}>
          WebGL Preview
        </span>
      </div>

      {/* Preview area — emits mouse events for control nodes */}
      <div
        style={{ flex: 1, minHeight: 100 }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          emitMouseEvent({ x, y, pressed: e.buttons > 0, scrollDelta: 0, touches: [] });
        }}
        onMouseDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          emitMouseEvent({ x, y, pressed: true, scrollDelta: 0, touches: [] });
        }}
        onMouseUp={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          emitMouseEvent({ x, y, pressed: false, scrollDelta: 0, touches: [] });
        }}
        onWheel={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          emitMouseEvent({ x, y, pressed: false, scrollDelta: e.deltaY / 100, touches: [] });
        }}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const touches = Array.from(e.touches).map(t => ({
            x: Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height)),
          }));
          const cx = touches.reduce((s, t) => s + t.x, 0) / touches.length;
          const cy = touches.reduce((s, t) => s + t.y, 0) / touches.length;
          emitMouseEvent({ x: cx, y: cy, pressed: true, scrollDelta: 0, touches });
        }}
        onTouchStart={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const touches = Array.from(e.touches).map(t => ({
            x: Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height)),
          }));
          const cx = touches.reduce((s, t) => s + t.x, 0) / touches.length;
          const cy = touches.reduce((s, t) => s + t.y, 0) / touches.length;
          emitMouseEvent({ x: cx, y: cy, pressed: true, scrollDelta: 0, touches });
        }}
        onTouchEnd={() => {
          // Do not emit on touch end -- freeze behavior
        }}
      >
        {fullscreenOpen ? (
          /* When fullscreen is open, show placeholder in node body */
          <div style={{ width: '100%', height: '100%', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: '#444' }}>Fullscreen</span>
          </div>
        ) : (
          <PreviewCanvas
            width={resolution.width}
            height={resolution.height}
            canvasRef={canvasRef}
            containerRef={containerRef}
            isEmpty={isEmpty}
          />
        )}
      </div>

      {/* Toolbar */}
      {toolbar}

      {/* Fullscreen modal — canvas is portaled into it */}
      {fullscreenOpen && (
        <PreviewFullscreenModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          toolbar={toolbar}
        >
          <PreviewCanvas
            width={resolution.width}
            height={resolution.height}
            canvasRef={canvasRef}
            containerRef={containerRef}
            isEmpty={isEmpty}
          />
        </PreviewFullscreenModal>
      )}

      {/* Export modal */}
      {exportOpen && (
        <ExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          previewNodeId={id}
          initialResolution={resolutionPreset}
          initialFpsCap={fpsCap}
          initialCustomWidth={customWidth}
          initialCustomHeight={customHeight}
        />
      )}

      {/* Input handle — webgl target */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-0"
        index={0}
        label="Source"
        isConnectable={10}
        style={{ top: '50%' }}
      />
    </div>
  );
}

export const WebGLPreviewNode = withNodeErrorBoundary(WebGLPreviewNodeInner);
export default WebGLPreviewNode;
