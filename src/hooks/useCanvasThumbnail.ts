import { toPng } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

/**
 * Capture a PNG thumbnail of the current canvas state.
 * Returns a Blob on success, null on failure (thumbnail is non-critical).
 */
export async function captureCanvasThumbnail(
  nodes: Node[],
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
      0.5,
      2,
      0.1,
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
    await fetch(`/api/projects/${projectId}/thumbnail`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    // Fire-and-forget — don't block navigation
  }
}
