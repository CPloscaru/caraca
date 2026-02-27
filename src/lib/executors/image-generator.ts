import { fal } from '@/lib/fal/client';
import { classifyFalError } from '@/lib/fal/error-classifier';
import { ensureFalCdnUrl } from '@/lib/fal/upload-local';
import { useCanvasStore } from '@/stores/canvas-store';
import type { ImageGeneratorData } from '@/types/canvas';
import type { NodeExecutor } from './types';
import { ASPECT_RATIO_PRESETS, applySchemaParams } from './helpers';

export const imageGeneratorExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  inputs,
  signal,
) => {
  const data = nodeData as unknown as ImageGeneratorData;
  const model = data.model || 'fal-ai/flux/dev';
  const aspectRatio = data.aspectRatio || '1:1';
  const numImages = data.numImages || 1;

  // Resolve prompt: prefer connected input over inline prompt
  const resolvedPrompt =
    (inputs['text-target-0'] as string) ?? data.prompt ?? '';

  if (!resolvedPrompt.trim()) {
    throw new Error('No prompt provided for image generation');
  }

  // Resolve image input (for image-to-image workflows)
  const imageInputUrl = inputs['image-target-1'] as string | undefined;

  // Re-upload local images to fal CDN (per FND-03)
  let resolvedImageUrl = imageInputUrl;
  if (imageInputUrl) {
    resolvedImageUrl = await ensureFalCdnUrl(imageInputUrl);
  }

  // Build fal.ai input
  const falInput: Record<string, unknown> = {
    prompt: resolvedPrompt,
  };

  // Use string enum if available (schema-driven), fall back to width/height object
  const imageSizeOption = (data as Record<string, unknown>).imageSizeOption as string | undefined;
  if (imageSizeOption) {
    falInput.image_size = imageSizeOption;
  } else {
    falInput.image_size = ASPECT_RATIO_PRESETS[aspectRatio] || { width: 1024, height: 1024 };
  }

  // Only send num_images when > 1 (avoids unsupported-param errors on models without it)
  if (numImages > 1) {
    falInput.num_images = numImages;
  }
  if (resolvedImageUrl) {
    falInput.image_url = resolvedImageUrl;
  }

  // Merge dynamic schema params (won't overwrite dedicated keys)
  applySchemaParams(falInput, nodeData as Record<string, unknown>);

  // Capture debug request payload
  const debugRequest = { model, ...falInput };

  try {
    const result = await fal.subscribe(model, {
      input: falInput,
      logs: true,
      pollInterval: 1000,
      abortSignal: signal,
    });

    // Extract images from result
    const resultData = result.data as Record<string, unknown>;
    const images =
      (resultData.images as Array<{ url: string; width: number; height: number }>) ??
      [];

    // Return selected image URL for downstream nodes + __images for node data update
    const selectedIndex = (data as ImageGeneratorData).selectedImageIndex ?? 0;
    const selectedImage = images[selectedIndex] ?? images[0];
    return {
      'image-source-0': selectedImage?.url ?? null,
      __images: images,
      __debugRequest: debugRequest,
      __debugResponse: resultData,
    };
  } catch (err) {
    // Check if cancelled
    if (signal.aborted) {
      throw new DOMException('Execution was cancelled', 'AbortError');
    }

    const rawError = err instanceof Error
      ? { message: err.message, ...(typeof (err as unknown as Record<string, unknown>).body === 'object' ? (err as unknown as Record<string, unknown>).body as Record<string, unknown> : {}) }
      : err;
    useCanvasStore.getState().updateNodeData(_nodeId, { debugRequest, debugError: rawError });

    const classified = classifyFalError(err);
    throw new Error(`${classified.message} — ${classified.suggestion}`);
  }
};
