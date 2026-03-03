'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges } from '@xyflow/react';
import { Camera } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { getWebGLOutput } from '@/lib/webgl/output-map';
import type { WebGLSnapshotData } from '@/types/canvas';
import type { WebGLNodeOutput } from '@/lib/webgl/types';
import type { WebGLRenderer } from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADER_COLOR = '#4caf50';
const PREVIEW_W = 200;
const PREVIEW_H = 120;

// ---------------------------------------------------------------------------
// Blit helper (same as use-webgl-preview, inlined to avoid coupling)
// ---------------------------------------------------------------------------

function blitToCanvas(
  renderer: WebGLRenderer,
  source: WebGLNodeOutput,
  canvas: HTMLCanvasElement,
  pixelBuf: Uint8Array,
): void {
  const { target, width, height } = source;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixelBuf);

  // Flip vertically (WebGL bottom-up)
  const rowSize = width * 4;
  const halfHeight = (height / 2) | 0;
  const tempRow = new Uint8Array(rowSize);
  for (let y = 0; y < halfHeight; y++) {
    const topOffset = y * rowSize;
    const bottomOffset = (height - 1 - y) * rowSize;
    tempRow.set(pixelBuf.subarray(topOffset, topOffset + rowSize));
    pixelBuf.copyWithin(topOffset, bottomOffset, bottomOffset + rowSize);
    pixelBuf.set(tempRow, bottomOffset);
  }

  const clamped = new Uint8ClampedArray(pixelBuf.length);
  clamped.set(pixelBuf);
  const imageData = new ImageData(clamped, width, height);
  ctx.putImageData(imageData, 0, 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function WebGLSnapshotNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as WebGLSnapshotData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useEdges();

  const scrubTime = d.scrubTime ?? 0.5;
  const capturedImageUrl = d.capturedImageUrl ?? null;

  // Find the upstream webgl source key
  const sourceKey = useMemo(() => {
    const edge = edges.find(
      (e) => e.target === id && e.targetHandle?.startsWith('webgl-'),
    );
    if (!edge) return null;
    return `${edge.source}:${edge.sourceHandle}`;
  }, [edges, id]);

  const isEmpty = !sourceKey;

  // Refs for blit
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelBufRef = useRef<Uint8Array | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);

  // Acquire/release renderer
  useEffect(() => {
    if (isEmpty) return;
    rendererRef.current = acquireRenderer();
    return () => {
      releaseRenderer();
      rendererRef.current = null;
      pixelBufRef.current = null;
    };
  }, [isEmpty]);

  // Render a single frame to the mini-preview whenever scrubTime or sourceKey changes
  const updatePreview = useCallback(() => {
    if (!sourceKey || !rendererRef.current || !previewCanvasRef.current) return;

    const source = getWebGLOutput(sourceKey);
    if (!source) return;

    const bufSize = source.width * source.height * 4;
    if (!pixelBufRef.current || pixelBufRef.current.length !== bufSize) {
      pixelBufRef.current = new Uint8Array(bufSize);
    }

    blitToCanvas(rendererRef.current, source, previewCanvasRef.current, pixelBufRef.current);
  }, [sourceKey]);

  // Update preview on mount and when source changes
  useEffect(() => {
    if (isEmpty) return;
    // Use rAF to ensure upstream has rendered
    const rafId = requestAnimationFrame(() => updatePreview());
    return () => cancelAnimationFrame(rafId);
  }, [isEmpty, updatePreview, scrubTime]);

  // Also periodically refresh the preview (captures live animation state)
  useEffect(() => {
    if (isEmpty) return;
    const interval = setInterval(() => updatePreview(), 200);
    return () => clearInterval(interval);
  }, [isEmpty, updatePreview]);

  // Capture state
  const [captureFlash, setCaptureFlash] = useState(false);

  const handleCapture = useCallback(() => {
    if (!sourceKey || !rendererRef.current) return;

    const source = getWebGLOutput(sourceKey);
    if (!source) return;

    const { target, width, height } = source;

    // Read pixels
    const bufSize = width * height * 4;
    const buf = new Uint8Array(bufSize);
    rendererRef.current.readRenderTargetPixels(target, 0, 0, width, height, buf);

    // Flip vertically
    const rowSize = width * 4;
    const halfHeight = (height / 2) | 0;
    const tempRow = new Uint8Array(rowSize);
    for (let y = 0; y < halfHeight; y++) {
      const topOffset = y * rowSize;
      const bottomOffset = (height - 1 - y) * rowSize;
      tempRow.set(buf.subarray(topOffset, topOffset + rowSize));
      buf.copyWithin(topOffset, bottomOffset, bottomOffset + rowSize);
      buf.set(tempRow, bottomOffset);
    }

    // Write to offscreen canvas and export as PNG
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const clamped = new Uint8ClampedArray(buf.length);
    clamped.set(buf);
    ctx.putImageData(new ImageData(clamped, width, height), 0, 0);

    const dataUrl = offscreen.toDataURL('image/png');
    updateNodeData(id, { capturedImageUrl: dataUrl });

    // Flash feedback
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 2000);
  }, [id, sourceKey, updateNodeData]);

  // Parse captured image dimensions
  const capturedDimensions = useMemo(() => {
    if (!capturedImageUrl) return null;
    // Get dimensions from the upstream source at capture time
    if (!sourceKey) return null;
    const source = getWebGLOutput(sourceKey);
    if (!source) return null;
    return { width: source.width, height: source.height };
  }, [capturedImageUrl, sourceKey]);

  const handleScrubChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { scrubTime: parseFloat(e.target.value) });
    },
    [id, updateNodeData],
  );

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#333'}`,
        borderRadius: 8,
        minWidth: 220,
        maxWidth: 260,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected
          ? `0 0 0 2px ${HEADER_COLOR}, 0 0 12px rgba(76, 175, 80, 0.3)`
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          background: HEADER_COLOR,
          borderRadius: '7px 7px 0 0',
          userSelect: 'none',
        }}
      >
        <Camera size={12} color="#fff" />
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
          WebGL Snapshot
        </span>
      </div>

      {/* Mini-preview */}
      <div
        style={{
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            width: PREVIEW_W,
            height: PREVIEW_H,
            background: '#0a0a0a',
            borderRadius: 4,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isEmpty ? (
            <span style={{ fontSize: 10, color: '#555' }}>
              No source connected
            </span>
          ) : (
            <canvas
              ref={previewCanvasRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )}
        </div>

        {/* Timeline scrub slider */}
        <div className="nodrag nowheel" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#888', minWidth: 24 }}>
            {Math.round(scrubTime * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={scrubTime}
            onChange={handleScrubChange}
            disabled={isEmpty}
            style={{
              flex: 1,
              height: 4,
              cursor: isEmpty ? 'not-allowed' : 'pointer',
              accentColor: HEADER_COLOR,
            }}
          />
        </div>

        {/* Capture button */}
        <button
          className="nodrag"
          onClick={handleCapture}
          disabled={isEmpty}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '5px 0',
            background: captureFlash ? '#2e7d32' : '#333',
            border: `1px solid ${captureFlash ? '#4caf50' : '#555'}`,
            borderRadius: 4,
            color: captureFlash ? '#a5d6a7' : '#ccc',
            fontSize: 11,
            fontWeight: 500,
            cursor: isEmpty ? 'not-allowed' : 'pointer',
            opacity: isEmpty ? 0.5 : 1,
            transition: 'all 0.2s ease',
          }}
        >
          <Camera size={12} />
          {captureFlash ? 'Captured' : 'Capture'}
        </button>

        {/* Captured image thumbnail */}
        {capturedImageUrl && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              borderTop: '1px solid #333',
              paddingTop: 6,
            }}
          >
            <img
              src={capturedImageUrl}
              alt="Captured frame"
              style={{
                width: '100%',
                height: 60,
                objectFit: 'contain',
                borderRadius: 3,
                background: '#0a0a0a',
              }}
            />
            {capturedDimensions && (
              <span style={{ fontSize: 9, color: '#777', textAlign: 'center' }}>
                {capturedDimensions.width}x{capturedDimensions.height} PNG
              </span>
            )}
          </div>
        )}
      </div>

      {/* Input handle -- webgl target */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-0"
        index={0}
        label="Source"
        style={{ top: '50%' }}
      />

      {/* Output handle -- image source */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType="image"
        portId="image-source-0"
        index={0}
        label="Image"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export const WebGLSnapshotNode = withNodeErrorBoundary(WebGLSnapshotNodeInner);
export default WebGLSnapshotNode;
