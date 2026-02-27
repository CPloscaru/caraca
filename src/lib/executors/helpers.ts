/**
 * Shared helpers used by multiple executor implementations.
 */

import { classifyFalError } from '@/lib/fal/error-classifier';
import { useCanvasStore } from '@/stores/canvas-store';
import { useExecutionStore } from '@/stores/execution-store';

// ---------------------------------------------------------------------------
// Aspect ratio presets (mirrored from ImageGeneratorNode)
// ---------------------------------------------------------------------------

export const ASPECT_RATIO_PRESETS: Record<string, { width: number; height: number }> =
  {
    '1:1': { width: 1024, height: 1024 },
    '3:4': { width: 768, height: 1024 },
    '4:3': { width: 1024, height: 768 },
    '9:16': { width: 576, height: 1024 },
    '16:9': { width: 1024, height: 576 },
  };

// ---------------------------------------------------------------------------
// Schema params helper
// ---------------------------------------------------------------------------

/** Check if a value is an "empty" array (only contains empty objects). */
export function isEmptyArray(val: unknown): boolean {
  if (!Array.isArray(val)) return false;
  if (val.length === 0) return true;
  return val.every(
    (item) =>
      item != null &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      Object.keys(item as Record<string, unknown>).length === 0,
  );
}

/** Merge user-set schemaParams into falInput, without overwriting dedicated keys.
 *  Arrays that contain only empty objects (auto-init placeholders) are skipped. */
export function applySchemaParams(
  falInput: Record<string, unknown>,
  data: Record<string, unknown>,
): void {
  const schemaParams = data.schemaParams as Record<string, unknown> | undefined;
  if (!schemaParams) return;
  for (const [key, val] of Object.entries(schemaParams)) {
    if (val === undefined || val === null) continue;
    if (key in falInput) continue;
    // Skip auto-init placeholder arrays (e.g. multi_prompt: [{}])
    if (isEmptyArray(val)) continue;
    falInput[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Video helpers
// ---------------------------------------------------------------------------

async function downloadToLocal(
  cdnUrl: string,
  projectId: string,
): Promise<{ localUrl: string; cdnUrl: string }> {
  try {
    const res = await fetch(`/api/storage/${projectId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cdnUrl }),
    });
    if (res.ok) {
      const data = (await res.json()) as { localUrl: string };
      return { localUrl: data.localUrl, cdnUrl };
    }
    return { localUrl: cdnUrl, cdnUrl };
  } catch {
    return { localUrl: cdnUrl, cdnUrl };
  }
}

export function downloadImageToLocal(cdnUrl: string) {
  const projectId = useExecutionStore.getState().projectId;
  if (!projectId) return Promise.resolve({ localUrl: cdnUrl, cdnUrl });
  return downloadToLocal(cdnUrl, projectId);
}

export function downloadVideoToLocal(cdnUrl: string) {
  const projectId = useExecutionStore.getState().projectId;
  if (!projectId) return Promise.resolve({ localUrl: cdnUrl, cdnUrl });
  return downloadToLocal(cdnUrl, projectId);
}

export function normalizeVideoUrl(
  resultData: Record<string, unknown>,
): string | null {
  const video = resultData.video;
  if (video && typeof video === 'object' && 'url' in (video as Record<string, unknown>)) {
    return (video as Record<string, unknown>).url as string;
  }
  if (typeof video === 'string') return video;
  if (typeof resultData.video_url === 'string') return resultData.video_url;
  return null;
}

// ---------------------------------------------------------------------------
// Shared fal.ai executor error handler
// ---------------------------------------------------------------------------

export function handleExecutorError(
  err: unknown,
  signal: AbortSignal,
  nodeId: string,
  debugRequest: Record<string, unknown>,
): never {
  if (signal.aborted) {
    throw new DOMException('Execution was cancelled', 'AbortError');
  }

  const rawError = err instanceof Error
    ? { message: err.message, ...(typeof (err as unknown as Record<string, unknown>).body === 'object' ? (err as unknown as Record<string, unknown>).body as Record<string, unknown> : {}) }
    : err;
  useCanvasStore.getState().updateNodeData(nodeId, { debugRequest, debugError: rawError });

  const classified = classifyFalError(err);
  throw new Error(`${classified.message} — ${classified.suggestion}`);
}
