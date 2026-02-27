import { toPng } from 'html-to-image';
import { getViewportForBounds, type Node, type Rect } from '@xyflow/react';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

/**
 * Capture a PNG thumbnail of the current canvas state.
 * Accepts `getNodesBounds` from `useReactFlow()` to avoid the deprecated
 * standalone import (which lacks nodeLookup for sub-flows).
 * Returns a Blob on success, null on failure (thumbnail is non-critical).
 */
export async function captureCanvasThumbnail(
  nodes: Node[],
  getNodesBounds: (nodes: Node[]) => Rect,
): Promise<Blob | null> {
  try {
    if (nodes.length === 0) return null;

    const viewportEl = document.querySelector(
      '.react-flow__viewport',
    ) as HTMLElement | null;
    if (!viewportEl) return null;

    const nodesBounds = getNodesBounds(nodes);
    // Add generous padding around the bounding box so the full workflow is visible
    const padding = 50;
    const paddedBounds: Rect = {
      x: nodesBounds.x - padding,
      y: nodesBounds.y - padding,
      width: nodesBounds.width + padding * 2,
      height: nodesBounds.height + padding * 2,
    };
    const viewport = getViewportForBounds(
      paddedBounds,
      THUMBNAIL_WIDTH,
      THUMBNAIL_HEIGHT,
      0.1,
      1.5,
      0,
    );

    if (!viewport) return null;

    const dataUrl = await toPng(viewportEl, {
      backgroundColor: '#111111',
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      style: {
        width: `${THUMBNAIL_WIDTH}px`,
        height: `${THUMBNAIL_HEIGHT}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });

    // Convert data URL to Blob
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    // Thumbnail capture is non-critical — fail silently
    return null;
  }
}

/**
 * Upload a thumbnail blob for a project. Fire-and-forget.
 */
export async function uploadThumbnail(
  projectId: string,
  blob: Blob,
): Promise<void> {
  try {
    const formData = new FormData();
    formData.append('file', blob, 'thumbnail.png');
    await fetch(`/api/storage/${projectId}/thumbnail`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    // Fire-and-forget — don't block navigation
  }
}
