import { fal } from '@/lib/fal/client';
import { classifyFalError } from '@/lib/fal/error-classifier';
import { ensureFalCdnUrl } from '@/lib/fal/upload-local';
import { useCanvasStore } from '@/stores/canvas-store';
import { getModelParams, DEFAULT_UPSCALE_MODEL } from '@/lib/upscale/model-params';
import type { ImageUpscaleData } from '@/types/canvas';
import type { NodeExecutor } from './types';
import { applySchemaParams } from './helpers';

export const imageUpscaleExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  inputs,
  signal,
) => {
  const data = nodeData as unknown as ImageUpscaleData;
  const model = data.model || DEFAULT_UPSCALE_MODEL;
  const scaleFactor = data.scaleFactor ?? 4;

  // Require an input image
  const imageUrl = inputs['image-target-0'] as string | undefined;
  if (!imageUrl) {
    throw new Error('No image connected to upscale node');
  }

  // Re-upload local images to fal CDN
  const resolvedUrl = await ensureFalCdnUrl(imageUrl);

  // Build fal input with model-specific parameter names
  const params = getModelParams(model);
  const falInput: Record<string, unknown> = {
    [params.imageParam]: resolvedUrl,
    [params.scaleParam]: scaleFactor,
  };

  // Add optional text prompt if the model supports it
  if (params.supportsPrompt) {
    const textPrompt = (inputs['text-target-0'] as string) ?? data.prompt ?? '';
    if (textPrompt.trim()) {
      falInput.prompt = textPrompt;
    }
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

    const resultData = result.data as Record<string, unknown>;
    const image = resultData.image as { url: string; width: number; height: number };

    return {
      'image-source-0': image.url,
      __outputImage: { url: image.url, width: image.width, height: image.height },
      __inputImageUrl: resolvedUrl,
      __debugRequest: debugRequest,
      __debugResponse: resultData,
    };
  } catch (err) {
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
