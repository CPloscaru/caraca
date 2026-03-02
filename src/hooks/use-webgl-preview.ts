'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { WebGLRenderer } from 'three';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import type { WebGLNodeOutput } from '@/lib/webgl/types';
import type { FpsCap } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Blit helper: read pixels from WebGLRenderTarget -> 2D canvas
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

  // Resize canvas attributes if mismatched
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  // Read pixels from render target
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixelBuf);

  // WebGL readPixels gives bottom-up rows; flip vertically
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
// Hook
// ---------------------------------------------------------------------------

type UseWebGLPreviewParams = {
  nodeId: string;
  isPlaying: boolean;
  fpsCap: FpsCap;
  activeSourceKey: string | null;
  getOutput: (key: string) => WebGLNodeOutput | undefined;
};

type UseWebGLPreviewResult = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  actualFps: React.RefObject<number>;
  isVisible: React.RefObject<boolean>;
};

export function useWebGLPreview({
  nodeId,
  isPlaying,
  fpsCap,
  activeSourceKey,
  getOutput,
}: UseWebGLPreviewParams): UseWebGLPreviewResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisibleRef = useRef(true);
  const actualFpsRef = useRef(0);

  // Mutable refs to avoid stale closures in RAF
  const isPlayingRef = useRef(isPlaying);
  const fpsCapRef = useRef(fpsCap);
  const activeSourceKeyRef = useRef(activeSourceKey);
  const getOutputRef = useRef(getOutput);
  const lastFrameRef = useRef(0);
  const pixelBufRef = useRef<Uint8Array | null>(null);
  const fpsAccRef = useRef({ frames: 0, lastSample: 0 });

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { fpsCapRef.current = fpsCap; }, [fpsCap]);
  useEffect(() => { activeSourceKeyRef.current = activeSourceKey; }, [activeSourceKey]);
  useEffect(() => { getOutputRef.current = getOutput; }, [getOutput]);

  // IntersectionObserver for auto-pause when offscreen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // RAF blit registration
  useEffect(() => {
    if (!activeSourceKey) return;

    const renderer = acquireRenderer();
    const callbackId = `preview-${nodeId}`;

    registerCallback(callbackId, (time) => {
      if (!isPlayingRef.current || !isVisibleRef.current) return;

      // FPS cap
      const interval = 1000 / fpsCapRef.current;
      if (time - lastFrameRef.current < interval) return;
      lastFrameRef.current = time;

      const key = activeSourceKeyRef.current;
      if (!key) return;

      const source = getOutputRef.current(key);
      if (!source || !canvasRef.current) return;

      // Ensure pixel buffer is correct size
      const bufSize = source.width * source.height * 4;
      if (!pixelBufRef.current || pixelBufRef.current.length !== bufSize) {
        pixelBufRef.current = new Uint8Array(bufSize);
      }

      blitToCanvas(renderer, source, canvasRef.current, pixelBufRef.current);

      // Track actual FPS via simple counter
      const acc = fpsAccRef.current;
      acc.frames++;
      if (time - acc.lastSample >= 1000) {
        actualFpsRef.current = acc.frames;
        acc.frames = 0;
        acc.lastSample = time;
      }
    });

    return () => {
      unregisterCallback(callbackId);
      releaseRenderer();
      pixelBufRef.current = null;
    };
  }, [nodeId, activeSourceKey]);

  return { canvasRef, containerRef, actualFps: actualFpsRef, isVisible: isVisibleRef };
}

// Re-export for convenience
export type { UseWebGLPreviewResult };
