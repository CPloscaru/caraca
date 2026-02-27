import { ensureFalCdnUrl } from '@/lib/fal/upload-local';
import type { LLMAssistantData } from '@/types/canvas';
import type { NodeExecutor } from './types';

export const llmAssistantExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  inputs,
  signal,
) => {
  const data = nodeData as unknown as LLMAssistantData;

  if (!data.model) {
    throw new Error('No model selected in LLM Assistant node');
  }
  if (!data.instruction?.trim()) {
    throw new Error('No instruction provided in LLM Assistant node');
  }

  // Build messages array
  type MessageContent =
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

  let content: MessageContent;
  const imageInput = inputs['image-target-0'] as string | undefined;

  // Re-upload local images to fal CDN so external APIs can access them (per FND-03)
  let resolvedImageInput = imageInput;
  if (imageInput) {
    resolvedImageInput = await ensureFalCdnUrl(imageInput);
  }

  if (resolvedImageInput) {
    // Multimodal: image + text instruction
    content = [
      { type: 'image_url', image_url: { url: resolvedImageInput } },
      { type: 'text', text: data.instruction },
    ];
  } else {
    content = data.instruction;
  }

  const messages = [{ role: 'user', content }];

  try {
    const res = await fetch('/api/openrouter/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: data.model, messages }),
      signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(
        (errData as Record<string, unknown>).error as string ||
          `OpenRouter API error: ${res.status}`,
      );
    }

    const result = await res.json();
    const responseText =
      (result as Record<string, unknown> & { choices?: Array<{ message?: { content?: string } }> })
        .choices?.[0]?.message?.content ?? '';

    const usage = (result as Record<string, unknown> & {
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }).usage;

    const tokenUsage = usage
      ? {
          prompt: usage.prompt_tokens ?? 0,
          completion: usage.completion_tokens ?? 0,
          total: usage.total_tokens ?? 0,
        }
      : null;

    return {
      'text-source-0': responseText,
      __llmOutput: responseText,
      __tokenUsage: tokenUsage,
    };
  } catch (err) {
    if (signal.aborted) {
      throw new DOMException('Execution was cancelled', 'AbortError');
    }
    throw err;
  }
};
