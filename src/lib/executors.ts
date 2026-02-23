/**
 * Node executor registry — maps node type strings to async executor functions.
 *
 * Orchestrates single-node and full-workflow execution using the DAG engine,
 * fal.ai client, and execution/canvas stores.
 */

import { fal } from '@/lib/fal/client';
import { classifyFalError } from '@/lib/fal/error-classifier';
import { ensureFalCdnUrl } from '@/lib/fal/upload-local';
import {
  topologicalSort,
  detectCycle,
  getUpstreamNodes,
  executeDag,
  CycleError,
} from '@/lib/dag';
import { applyNodeResult } from '@/lib/node-registry';
import { useCanvasStore } from '@/stores/canvas-store';
import { useExecutionStore } from '@/stores/execution-store';
import type {
  TextInputData,
  ImageImportData,
  ImageGeneratorData,
  LLMAssistantData,
  ImageUpscaleData,
  TextToVideoData,
  ImageToVideoData,
} from '@/types/canvas';
import { getModelParams, DEFAULT_UPSCALE_MODEL } from '@/lib/upscale/model-params';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeExecutor = (
  nodeId: string,
  nodeData: Record<string, unknown>,
  inputs: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Aspect ratio presets (mirrored from ImageGeneratorNode)
// ---------------------------------------------------------------------------

const ASPECT_RATIO_PRESETS: Record<string, { width: number; height: number }> =
  {
    '1:1': { width: 1024, height: 1024 },
    '3:4': { width: 768, height: 1024 },
    '4:3': { width: 1024, height: 768 },
    '9:16': { width: 576, height: 1024 },
    '16:9': { width: 1024, height: 576 },
  };

// ---------------------------------------------------------------------------
// Video default models
// ---------------------------------------------------------------------------

const DEFAULT_TEXT_TO_VIDEO_MODEL = 'fal-ai/wan/v2.1/1.3b/text-to-video';
const DEFAULT_IMAGE_TO_VIDEO_MODEL = 'fal-ai/minimax-video/image-to-video';

// ---------------------------------------------------------------------------
// Video helpers
// ---------------------------------------------------------------------------

async function downloadVideoToLocal(
  cdnUrl: string,
): Promise<{ localUrl: string; cdnUrl: string }> {
  try {
    const res = await fetch('/api/videos/download', {
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

function normalizeVideoUrl(
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
// Executor implementations
// ---------------------------------------------------------------------------

const textInputExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  _inputs,
  _signal,
) => {
  const data = nodeData as unknown as TextInputData;
  return { 'text-source-0': data.value ?? '' };
};

const imageImportExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  _inputs,
  _signal,
) => {
  const data = nodeData as unknown as ImageImportData;
  if (!data.imageUrl) {
    throw new Error('No image uploaded in Image Import node');
  }
  return { 'image-source-0': data.imageUrl };
};

const imageGeneratorExecutor: NodeExecutor = async (
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
    image_size: ASPECT_RATIO_PRESETS[aspectRatio] || { width: 1024, height: 1024 },
    num_images: numImages,
  };
  if (resolvedImageUrl) {
    falInput.image_url = resolvedImageUrl;
  }

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
    };
  } catch (err) {
    // Check if cancelled
    if (signal.aborted) {
      throw new DOMException('Execution was cancelled', 'AbortError');
    }

    const classified = classifyFalError(err);
    throw new Error(`${classified.message} — ${classified.suggestion}`);
  }
};

const llmAssistantExecutor: NodeExecutor = async (
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

const imageUpscaleExecutor: NodeExecutor = async (
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
    };
  } catch (err) {
    if (signal.aborted) {
      throw new DOMException('Execution was cancelled', 'AbortError');
    }
    const classified = classifyFalError(err);
    throw new Error(`${classified.message} — ${classified.suggestion}`);
  }
};

const textToVideoExecutor: NodeExecutor = async (
  nodeId,
  nodeData,
  inputs,
  signal,
) => {
  const data = nodeData as unknown as TextToVideoData;
  const model = data.model || DEFAULT_TEXT_TO_VIDEO_MODEL;

  // Resolve prompt: prefer connected input over inline prompt
  const resolvedPrompt =
    (inputs['text-target-0'] as string) ?? data.prompt ?? '';

  if (!resolvedPrompt.trim()) {
    throw new Error('No prompt provided for video generation');
  }

  // Build fal.ai input
  const falInput: Record<string, unknown> = { prompt: resolvedPrompt };
  if (data.aspectRatio) falInput.aspect_ratio = data.aspectRatio;
  if (data.duration) falInput.duration = data.duration;
  if (data.seed != null) falInput.seed = data.seed;

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
    };
  } catch (err) {
    if (signal.aborted) {
      throw new DOMException('Execution was cancelled', 'AbortError');
    }
    const classified = classifyFalError(err);
    throw new Error(`${classified.message} — ${classified.suggestion}`);
  }
};

const imageToVideoExecutor: NodeExecutor = async (
  nodeId,
  nodeData,
  inputs,
  signal,
) => {
  const data = nodeData as unknown as ImageToVideoData;
  const model = data.model || DEFAULT_IMAGE_TO_VIDEO_MODEL;

  // Resolve image URL from connected input
  const imageInput = inputs['image-target-0'] as string | undefined;
  let resolvedImageUrl = imageInput;
  if (imageInput) {
    resolvedImageUrl = await ensureFalCdnUrl(imageInput);
  }

  // Resolve prompt (optional for some models)
  const resolvedPrompt =
    (inputs['text-target-0'] as string) ?? data.prompt ?? '';

  // Build fal.ai input
  const falInput: Record<string, unknown> = {};
  if (resolvedImageUrl) falInput.image_url = resolvedImageUrl;
  if (resolvedPrompt.trim()) falInput.prompt = resolvedPrompt;
  if (data.aspectRatio) falInput.aspect_ratio = data.aspectRatio;
  if (data.duration) falInput.duration = data.duration;
  if (data.seed != null) falInput.seed = data.seed;

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
    };
  } catch (err) {
    if (signal.aborted) {
      throw new DOMException('Execution was cancelled', 'AbortError');
    }
    const classified = classifyFalError(err);
    throw new Error(`${classified.message} — ${classified.suggestion}`);
  }
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const executors: Record<string, NodeExecutor> = {
  textInput: textInputExecutor,
  imageImport: imageImportExecutor,
  imageGenerator: imageGeneratorExecutor,
  llmAssistant: llmAssistantExecutor,
  imageUpscale: imageUpscaleExecutor,
  textToVideo: textToVideoExecutor,
  imageToVideo: imageToVideoExecutor,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a single node by its type, given its data and resolved inputs.
 */
export async function executeNodeByType(
  nodeId: string,
  nodeType: string,
  nodeData: Record<string, unknown>,
  inputs: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const executor = executors[nodeType];
  if (!executor) throw new Error(`No executor for node type: ${nodeType}`);
  return executor(nodeId, nodeData, inputs, signal);
}

/**
 * Run a single node and all its upstream dependencies.
 * Plain async function — accesses stores via getState() for outside-React usage.
 */
export async function runSingleNode(nodeId: string): Promise<void> {
  const { nodes, edges } = useCanvasStore.getState();
  const execStore = useExecutionStore.getState();

  const targetNode = nodes.find((n) => n.id === nodeId);
  if (!targetNode) throw new Error(`Node not found: ${nodeId}`);

  // Get upstream subgraph including the target node
  const nodeIds = nodes.map((n) => n.id);
  const edgesSimple = edges.map((e) => ({
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? '',
    targetHandle: e.targetHandle ?? '',
  }));

  const sortedIds = getUpstreamNodes(nodeId, nodeIds, edgesSimple);

  // Start execution
  const controller = execStore.startExecution();
  const signal = controller.signal;

  // Set all upstream nodes to pending
  for (const id of sortedIds) {
    useExecutionStore.getState().setNodeStatus(id, 'pending');
  }

  try {
    const results = await executeDag({
      sortedNodeIds: sortedIds,
      edges: edgesSimple,
      executeNode: async (nId, inputs, sig) => {
        const node = nodes.find((n) => n.id === nId);
        if (!node) throw new Error(`Node not found: ${nId}`);
        const nodeType = (node.data as Record<string, unknown>).type as string;
        const result = await executeNodeByType(
          nId,
          nodeType,
          node.data as Record<string, unknown>,
          inputs,
          sig,
        );
        const cleanResult = applyNodeResult(
          nodeType,
          nId,
          result,
          useCanvasStore.getState().updateNodeData,
        );
        useExecutionStore.getState().setNodeResult(nId, cleanResult);
        return cleanResult;
      },
      signal,
      onStatusChange: (nId, status) => {
        useExecutionStore.getState().setNodeStatus(nId, status);
      },
    });

    // Check for errors in results
    for (const nId of sortedIds) {
      const nodeResult = results[nId] as Record<string, unknown> | undefined;
      if (nodeResult && '__error' in nodeResult) {
        useExecutionStore
          .getState()
          .setNodeError(nId, nodeResult.__error as string);
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Cancelled — keep completed results
    } else {
      console.error('Execution error:', err);
    }
  } finally {
    useExecutionStore.getState().cancelExecution();
  }
}

/**
 * Run all nodes in the workflow in topological order.
 * Plain async function — accesses stores via getState() for outside-React usage.
 */
export async function runAllWorkflow(): Promise<void> {
  const { nodes, edges } = useCanvasStore.getState();
  const execStore = useExecutionStore.getState();

  if (nodes.length === 0) return;

  const nodeIds = nodes.map((n) => n.id);
  const edgesSimple = edges.map((e) => ({
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? '',
    targetHandle: e.targetHandle ?? '',
  }));

  // Check for cycles
  const cycle = detectCycle(nodeIds, edgesSimple);
  if (cycle) {
    throw new CycleError(cycle);
  }

  // Get topological order
  const sortedIds = topologicalSort(nodeIds, edgesSimple);

  // Start execution
  const controller = execStore.startExecution();
  const signal = controller.signal;

  // Set all nodes to pending
  for (const id of sortedIds) {
    useExecutionStore.getState().setNodeStatus(id, 'pending');
  }

  try {
    const results = await executeDag({
      sortedNodeIds: sortedIds,
      edges: edgesSimple,
      executeNode: async (nId, inputs, sig) => {
        const node = nodes.find((n) => n.id === nId);
        if (!node) throw new Error(`Node not found: ${nId}`);
        const nodeType = (node.data as Record<string, unknown>).type as string;
        const result = await executeNodeByType(
          nId,
          nodeType,
          node.data as Record<string, unknown>,
          inputs,
          sig,
        );

        const cleanResult = applyNodeResult(
          nodeType,
          nId,
          result,
          useCanvasStore.getState().updateNodeData,
        );
        useExecutionStore.getState().setNodeResult(nId, cleanResult);
        return cleanResult;
      },
      signal,
      onStatusChange: (nId, status) => {
        useExecutionStore.getState().setNodeStatus(nId, status);
      },
    });

    // Check for errors in results
    for (const nId of sortedIds) {
      const nodeResult = results[nId] as Record<string, unknown> | undefined;
      if (nodeResult && '__error' in nodeResult) {
        useExecutionStore
          .getState()
          .setNodeError(nId, nodeResult.__error as string);
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Cancelled — keep completed results
    } else if (err instanceof CycleError) {
      console.error('Cycle detected:', err.message);
      throw err;
    } else {
      console.error('Execution error:', err);
    }
  } finally {
    useExecutionStore.getState().cancelExecution();
  }
}

export { executors };
