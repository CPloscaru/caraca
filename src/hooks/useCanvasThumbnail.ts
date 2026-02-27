import { toPng } from 'html-to-image';
import { getViewportForBounds, type Node, type Rect } from '@xyflow/react';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

/** Skip elements that would trigger CORS errors during toPng capture. */
function shouldIncludeNode(node: HTMLElement): boolean {
  if (node instanceof HTMLImageElement) {
    const src = node.src;
    // Allow data URIs and same-origin images
    if (!src || src.startsWith('data:') || src.startsWith(window.location.origin)) return true;
    // Allow relative URLs (local API routes)
    if (src.startsWith('/')) return true;
    // Skip cross-origin images (fal.ai CDN, Google Cloud Storage, etc.)
    return false;
  }
  return true;
}

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
    const viewport = getViewportForBounds(
      nodesBounds,
      THUMBNAIL_WIDTH,
      THUMBNAIL_HEIGHT,
      0.01,
      1,
      '5%',
    );

    if (!viewport) return null;

    const dataUrl = await toPng(viewportEl, {
      backgroundColor: '#111111',
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      filter: shouldIncludeNode,
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
