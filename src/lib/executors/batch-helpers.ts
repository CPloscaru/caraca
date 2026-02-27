/**
 * Shared batch processing helpers.
 *
 * Extracted from runBatchNode / retryFailedBatchItems to eliminate
 * ~180 lines of duplicated accumulation + strip + write-back logic.
 */

import { useCanvasStore } from '@/stores/canvas-store';
import { useExecutionStore } from '@/stores/execution-store';

// ---------------------------------------------------------------------------
// Strip internal fields
// ---------------------------------------------------------------------------

/** Strip internal (__-prefixed) fields from an executor result. */
export function stripInternalFields(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result)) {
    if (!k.startsWith('__')) clean[k] = v;
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Accumulation types & factory
// ---------------------------------------------------------------------------

export type AccumulationMaps = {
  images: Map<string, Array<{ url: string; width: number; height: number }>>;
  videos: Map<string, Array<{ videoUrl: string; cdnUrl: string }>>;
};

/** Create a fresh pair of accumulation Maps. */
export function createAccumulationMaps(): AccumulationMaps {
  return {
    images: new Map(),
    videos: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Accumulate a single result
// ---------------------------------------------------------------------------

/**
 * Check an executor result and, if it belongs to an image/video batch
 * accumulation path, push it into the maps and return the cleaned result.
 *
 * Returns `{ accumulated: true, clean }` when the result was accumulated,
 * or `{ accumulated: false }` when the caller should fall through to the
 * normal `applyNodeResult` path.
 */
export function accumulateResult(
  nodeType: string,
  nodeId: string,
  result: Record<string, unknown>,
  maps: AccumulationMaps,
  setNodeResult: (id: string, r: Record<string, unknown>) => void,
):
  | { accumulated: true; clean: Record<string, unknown> }
  | { accumulated: false } {
  // Image accumulation
  if (nodeType === 'imageGenerator' && result.__images) {
    const existing = maps.images.get(nodeId) ?? [];
    existing.push(
      ...(result.__images as Array<{
        url: string;
        width: number;
        height: number;
      }>),
    );
    maps.images.set(nodeId, existing);

    const clean = stripInternalFields(result);
    setNodeResult(nodeId, clean);
    return { accumulated: true, clean };
  }

  // Video accumulation
  if (
    (nodeType === 'textToVideo' || nodeType === 'imageToVideo') &&
    result.__videoUrl
  ) {
    const existing = maps.videos.get(nodeId) ?? [];
    existing.push({
      videoUrl: result.__videoUrl as string,
      cdnUrl: result.__cdnUrl as string,
    });
    maps.videos.set(nodeId, existing);

    const clean = stripInternalFields(result);
    setNodeResult(nodeId, clean);
    return { accumulated: true, clean };
  }

  return { accumulated: false };
}

// ---------------------------------------------------------------------------
// Write accumulated images back to canvas nodes
// ---------------------------------------------------------------------------

type WriteImagesAppend = {
  mode: 'append';
  appendMode: boolean;
};

type WriteImagesMerge = {
  mode: 'merge-at-index';
  failedItems: Array<{ arrayIndex: number }>;
};

/**
 * Write accumulated images to each image-generator node.
 *
 * - **append**: prepend existing node images when `appendMode` is true.
 * - **merge-at-index**: replace images at the failed-item indices.
 *
 * Always reads fresh state via `useCanvasStore.getState()`.
 */
export function writeAccumulatedImages(
  images: AccumulationMaps['images'],
  options: WriteImagesAppend | WriteImagesMerge,
): void {
  for (const [nId, batchImages] of images) {
    const node = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === nId);

    if (options.mode === 'append') {
      const existingImages = options.appendMode
        ? ((node?.data as Record<string, unknown>)?.images as Array<{
            url: string;
            width: number;
            height: number;
          }>) ?? []
        : [];
      useCanvasStore.getState().updateNodeData(nId, {
        images: [...existingImages, ...batchImages],
        selectedImageIndex: 0,
      });
    } else {
      // merge-at-index
      const currentImages =
        ((node?.data as Record<string, unknown>)?.images as Array<{
          url: string;
          width: number;
          height: number;
        }>) ?? [];
      const updatedImages = [...currentImages];
      let retryIdx = 0;
      for (const failedItem of options.failedItems) {
        if (retryIdx < batchImages.length) {
          updatedImages[failedItem.arrayIndex] = batchImages[retryIdx];
          retryIdx++;
        }
      }
      useCanvasStore.getState().updateNodeData(nId, {
        images: updatedImages,
        selectedImageIndex: 0,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Write accumulated videos back to canvas nodes
// ---------------------------------------------------------------------------

type WriteVideosAppend = {
  mode: 'append';
  appendMode: boolean;
};

type WriteVideosMerge = {
  mode: 'merge-at-index';
  failedItems: Array<{ arrayIndex: number }>;
};

/**
 * Write accumulated videos to each video node.
 *
 * - **append**: prepend existing videoResults when `appendMode` is true.
 * - **merge-at-index**: replace videos at the failed-item indices.
 *
 * Always reads fresh state via `useCanvasStore.getState()`.
 */
export function writeAccumulatedVideos(
  videos: AccumulationMaps['videos'],
  options: WriteVideosAppend | WriteVideosMerge,
): void {
  for (const [nId, batchVideos] of videos) {
    const node = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === nId);

    if (options.mode === 'append') {
      const existingVideos = options.appendMode
        ? ((node?.data as Record<string, unknown>)?.videoResults as Array<{
            videoUrl: string;
            cdnUrl: string;
          }>) ?? []
        : [];
      const allVideos = [...existingVideos, ...batchVideos];
      useCanvasStore.getState().updateNodeData(nId, {
        videoResults: allVideos,
        videoUrl: allVideos[allVideos.length - 1]?.videoUrl ?? null,
        cdnUrl: allVideos[allVideos.length - 1]?.cdnUrl ?? null,
      });
    } else {
      // merge-at-index
      const currentVideos =
        ((node?.data as Record<string, unknown>)?.videoResults as Array<{
          videoUrl: string;
          cdnUrl: string;
        }>) ?? [];
      const updatedVideos = [...currentVideos];
      let retryIdx = 0;
      for (const failedItem of options.failedItems) {
        if (retryIdx < batchVideos.length) {
          updatedVideos[failedItem.arrayIndex] = batchVideos[retryIdx];
          retryIdx++;
        }
      }
      useCanvasStore.getState().updateNodeData(nId, {
        videoResults: updatedVideos,
        videoUrl: updatedVideos[updatedVideos.length - 1]?.videoUrl ?? null,
        cdnUrl: updatedVideos[updatedVideos.length - 1]?.cdnUrl ?? null,
      });
    }
  }
}
