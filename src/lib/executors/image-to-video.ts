import { fal } from '@/lib/fal/client';
import { ensureFalCdnUrl } from '@/lib/fal/upload-local';
import { useExecutionStore } from '@/stores/execution-store';
import { buildImagePayload, applyTextPortInputs } from '@/lib/fal/schema-payload';
import type { ImageToVideoData } from '@/types/canvas';
import type { NodeExecutor } from './types';
import { applySchemaParams, downloadVideoToLocal, normalizeVideoUrl, handleExecutorError } from './helpers';

const DEFAULT_IMAGE_TO_VIDEO_MODEL = 'fal-ai/minimax-video/image-to-video';

export const imageToVideoExecutor: NodeExecutor = async (
  nodeId,
  nodeData,
  inputs,
  signal,
) => {
  const data = nodeData as unknown as ImageToVideoData;
  const model = data.model || DEFAULT_IMAGE_TO_VIDEO_MODEL;

  // Resolve prompt (optional for some models)
  const resolvedPrompt =
    (inputs['text-target-0'] as string) ?? data.prompt ?? '';

  // Build fal.ai input
  const falInput: Record<string, unknown> = {};
  if (resolvedPrompt.trim()) falInput.prompt = resolvedPrompt;
  if (data.aspectRatio) falInput.aspect_ratio = data.aspectRatio;
  if (data.duration) falInput.duration = data.duration;
  if (data.seed != null) falInput.seed = data.seed;

  // Dynamic image port input mapping via generic payload builder
  const dynamicPorts = (nodeData as Record<string, unknown>).dynamicImagePorts as
    Array<{ fieldName: string; multi: boolean; maxConnections?: number }> | undefined;

  if (dynamicPorts) {
    const imagePayload = await buildImagePayload(dynamicPorts, inputs, ensureFalCdnUrl);
    Object.assign(falInput, imagePayload);
  } else {
    // Legacy fallback for pre-Phase-25 workflows
    const imageInput = inputs['image-target-0'] as string | undefined;
    if (imageInput) {
      falInput.image_url = await ensureFalCdnUrl(imageInput);
    }
  }

  // Apply text port inputs (connected Text Input nodes override inline values)
  applyTextPortInputs(inputs, falInput);

  // Merge dynamic schema params (won't overwrite dedicated keys)
  applySchemaParams(falInput, nodeData as Record<string, unknown>);

  // Capture debug request payload
  const debugRequest = { model, ...falInput };

  try {
    const result = await fal.subscribe(model, {
      input: falInput,
      logs: true,
      pollInterval: 2000,
      abortSignal: signal,
      onQueueUpdate: (status) => {
        useExecutionStore.getState().setNodeQueueStatus(nodeId, status);
      },
    });

    const resultData = result.data as Record<string, unknown>;
    const videoUrl = normalizeVideoUrl(resultData);
    if (!videoUrl) {
      throw new Error('No video URL in response');
    }

    const downloaded = await downloadVideoToLocal(videoUrl);
    return {
      'video-source-0': downloaded.localUrl,
      __videoUrl: downloaded.localUrl,
      __cdnUrl: downloaded.cdnUrl,
      __debugRequest: debugRequest,
      __debugResponse: resultData,
    };
  } catch (err) {
    handleExecutorError(err, signal, nodeId, debugRequest);
  }
};
