import { fal } from '@/lib/fal/client';
import { ensureFalCdnUrl } from '@/lib/fal/upload-local';
import { buildImagePayload, applyTextPortInputs } from '@/lib/fal/schema-payload';
import type { ImageGeneratorData } from '@/types/canvas';
import type { NodeExecutor } from './types';
import { ASPECT_RATIO_PRESETS, applySchemaParams, handleExecutorError, downloadImageToLocal } from './helpers';

export const imageGeneratorExecutor: NodeExecutor = async (
  nodeId,
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

  // Build fal.ai input
  const falInput: Record<string, unknown> = {
    prompt: resolvedPrompt,
  };

  // Merge dynamic schema params early so dedicated fields below can detect
  // whether the schema already provides image_size / num_images.
  applySchemaParams(falInput, nodeData as Record<string, unknown>);

  // image_size: only set if not already provided by schema params
  if (!('image_size' in falInput)) {
    const imageSizeOption = (data as Record<string, unknown>).imageSizeOption as string | undefined;
    if (imageSizeOption) {
      falInput.image_size = imageSizeOption;
    } else {
      falInput.image_size = ASPECT_RATIO_PRESETS[aspectRatio] || { width: 1024, height: 1024 };
    }
  }

  // num_images: only set if not already provided by schema params and > 1
  if (!('num_images' in falInput) && numImages > 1) {
    falInput.num_images = numImages;
  }

  // Dynamic image port input mapping via generic payload builder
  const dynamicPorts = (nodeData as Record<string, unknown>).dynamicImagePorts as
    Array<{ fieldName: string; multi: boolean; maxConnections?: number }> | undefined;

  if (dynamicPorts) {
    const imagePayload = await buildImagePayload(dynamicPorts, inputs, ensureFalCdnUrl);
    Object.assign(falInput, imagePayload);
  } else {
    // Legacy fallback for pre-Phase-32 workflows
    const imageInput = inputs['image-target-1'] as string | undefined;
    if (imageInput) {
      falInput.image_url = await ensureFalCdnUrl(imageInput);
    }
  }

  // Apply text port inputs (connected Text Input nodes override inline values)
  applyTextPortInputs(inputs, falInput);

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

    // Download all images to local storage
    const localImages = await Promise.all(
      images.map(async (img) => {
        const { localUrl } = await downloadImageToLocal(img.url);
        return { ...img, url: localUrl };
      }),
    );

    // Return selected image URL for downstream nodes + __images for node data update
    const selectedIndex = (data as ImageGeneratorData).selectedImageIndex ?? 0;
    const selectedImage = localImages[selectedIndex] ?? localImages[0];
    return {
      'image-source-0': selectedImage?.url ?? null,
      __images: localImages,
      __debugRequest: debugRequest,
      __debugResponse: resultData,
    };
  } catch (err) {
    handleExecutorError(err, signal, nodeId, debugRequest);
  }
};
