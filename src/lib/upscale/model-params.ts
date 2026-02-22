export type UpscaleModelParams = {
  scaleParam: string;       // 'scale' | 'upscale_factor'
  scaleRange: number[];     // Valid scale factors for this model
  supportsPrompt: boolean;
  imageParam: string;       // Always 'image_url'
  defaultScale: number;
};

export const MODEL_PARAMS: Record<string, UpscaleModelParams> = {
  'fal-ai/aura-sr': {
    scaleParam: 'upscale_factor', scaleRange: [4], supportsPrompt: false,
    imageParam: 'image_url', defaultScale: 4,
  },
  'fal-ai/creative-upscaler': {
    scaleParam: 'scale', scaleRange: [2, 4], supportsPrompt: true,
    imageParam: 'image_url', defaultScale: 2,
  },
  'fal-ai/esrgan': {
    scaleParam: 'scale', scaleRange: [2, 4, 8], supportsPrompt: false,
    imageParam: 'image_url', defaultScale: 2,
  },
  'fal-ai/clarity-upscaler': {
    scaleParam: 'upscale_factor', scaleRange: [2, 4], supportsPrompt: true,
    imageParam: 'image_url', defaultScale: 2,
  },
};

export const DEFAULT_UPSCALE_MODEL = 'fal-ai/aura-sr';

/** Get params for a model, falling back to sensible defaults for unknown models. */
export function getModelParams(model: string): UpscaleModelParams {
  return MODEL_PARAMS[model] ?? {
    scaleParam: 'scale', scaleRange: [2, 4], supportsPrompt: false,
    imageParam: 'image_url', defaultScale: 2,
  };
}
