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
  getDownstreamNodes,
  executeDag,
  CycleError,
} from '@/lib/dag';
import { executeDagBatch } from '@/lib/batch';
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
  BatchParameterData,
  BatchResultItem,
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
// Schema params helper
// ---------------------------------------------------------------------------

/** Merge user-set schemaParams into falInput, without overwriting dedicated keys. */
function applySchemaParams(
  falInput: Record<string, unknown>,
  data: Record<string, unknown>,
): void {
  const schemaParams = data.schemaParams as Record<string, unknown> | undefined;
  if (!schemaParams) return;
  for (const [key, val] of Object.entries(schemaParams)) {
    if (val !== undefined && val !== null && !(key in falInput)) {
      falInput[key] = val;
    }
  }
}

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
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// Batch parameter is a data provider — passthrough its first value during single-node DAG runs
const batchParameterExecutor: NodeExecutor = async (_nodeId, nodeData) => {
  const values = (nodeData.values as string[]) ?? [];
  return { text: values[0] ?? '' };
};

// Canvas note is a no-op annotation node — silently skipped during execution
const canvasNoteExecutor: NodeExecutor = async () => ({});

const executors: Record<string, NodeExecutor> = {
  textInput: textInputExecutor,
  imageImport: imageImportExecutor,
  imageGenerator: imageGeneratorExecutor,
  llmAssistant: llmAssistantExecutor,
  imageUpscale: imageUpscaleExecutor,
  textToVideo: textToVideoExecutor,
  imageToVideo: imageToVideoExecutor,
  batchParameter: batchParameterExecutor,
  canvasNote: canvasNoteExecutor,
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

  // Build cached results from upstream nodes that already have 'done' status.
  // The target node itself is never cached (user explicitly clicked Run on it).
  const cachedResults: Record<string, Record<string, unknown>> = {};
  for (const id of sortedIds) {
    if (id === nodeId) continue;
    const state = execStore.nodeStates[id];
    if (state?.status === 'done' && state.result) {
      cachedResults[id] = state.result as Record<string, unknown>;
    }
  }

  // Set nodes to pending (only those that will actually execute)
  for (const id of sortedIds) {
    if (cachedResults[id]) continue; // skip cached
    useExecutionStore.getState().setNodeStatus(id, 'pending');
  }

  try {
    const results = await executeDag({
      sortedNodeIds: sortedIds,
      edges: edgesSimple,
      cachedResults,
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

  // Filter out edges originating from annotation nodes (canvasNote) to prevent DAG corruption
  const noteNodeIds = new Set(
    nodes.filter((n) => (n.data as Record<string, unknown>).type === 'canvasNote').map((n) => n.id),
  );
  const edgesSimple = edges
    .filter((e) => e.type !== 'annotationEdge' && !noteNodeIds.has(e.source) && !noteNodeIds.has(e.target))
    .map((e) => ({
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

/**
 * Get the unit price from the first downstream node connected to the batch node.
 * Returns null if no pricing is available.
 */
function getDownstreamUnitPrice(
  batchNodeId: string,
  nodes: ReturnType<typeof useCanvasStore.getState>['nodes'],
  edges: ReturnType<typeof useCanvasStore.getState>['edges'],
): number | null {
  const outEdge = edges.find((e) => e.source === batchNodeId);
  if (!outEdge) return null;
  const targetNode = nodes.find((n) => n.id === outEdge.target);
  if (!targetNode) return null;
  const targetData = targetNode.data as Record<string, unknown>;
  return (targetData.unitPrice as number | null) ?? null;
}

/**
 * Run a batch parameter node: execute the downstream subgraph once per value.
 * Public entry point — similar to runSingleNode and runAllWorkflow.
 */
export async function runBatchNode(batchNodeId: string): Promise<void> {
  const { nodes, edges } = useCanvasStore.getState();
  const execStore = useExecutionStore.getState();

  const batchNode = nodes.find((n) => n.id === batchNodeId);
  if (!batchNode) throw new Error(`Batch node not found: ${batchNodeId}`);

  const batchData = batchNode.data as unknown as BatchParameterData;
  const values = batchData.values ?? [];

  if (values.length === 0) {
    throw new Error('No values provided for batch execution');
  }

  // Get downstream subgraph (includes the batch node itself)
  const nodeIds = nodes.map((n) => n.id);
  const edgesSimple = edges.map((e) => ({
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? '',
    targetHandle: e.targetHandle ?? '',
  }));

  const sortedIds = getDownstreamNodes(batchNodeId, nodeIds, edgesSimple);

  // Start execution
  const controller = execStore.startExecution();
  const signal = controller.signal;

  // Set downstream nodes (excluding batch node) to pending
  for (const id of sortedIds) {
    if (id !== batchNodeId) {
      useExecutionStore.getState().setNodeStatus(id, 'pending');
    }
  }

  // Accumulate images from imageGenerator nodes across batch iterations
  const accumulatedImages = new Map<string, Array<{ url: string; width: number; height: number }>>();

  // Accumulate videos from video nodes across batch iterations
  const accumulatedVideos = new Map<string, Array<{ videoUrl: string; cdnUrl: string }>>();

  // Running cost tracking
  let runningCost = 0;
  const downstreamUnitPrice = getDownstreamUnitPrice(batchNodeId, nodes, edges);

  try {
    const batchResults = await executeDagBatch({
      values,
      batchNodeId,
      // NOTE: Batch output is always text. The batch node injects each value
      // as a text string via text-source-0, regardless of the visual port type
      // shown on the node (which adapts dynamically to the connected edge).
      // This means batch parameters are always text — image/video batch input
      // would require a different node type (see POST-06 in REQUIREMENTS.md).
      batchOutputHandle: 'text-source-0',
      errorMode: batchData.errorMode ?? 'skip',
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

        // For imageGenerator nodes, accumulate images instead of overwriting per-iteration
        if (nodeType === 'imageGenerator' && result.__images) {
          const existing = accumulatedImages.get(nId) ?? [];
          existing.push(...(result.__images as Array<{ url: string; width: number; height: number }>));
          accumulatedImages.set(nId, existing);

          // Strip internal fields and return clean result for downstream without applying to node
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(result)) {
            if (!k.startsWith('__')) clean[k] = v;
          }
          useExecutionStore.getState().setNodeResult(nId, clean);
          return clean;
        }

        // For video nodes, accumulate videos instead of overwriting per-iteration
        if ((nodeType === 'textToVideo' || nodeType === 'imageToVideo') && result.__videoUrl) {
          const existing = accumulatedVideos.get(nId) ?? [];
          existing.push({
            videoUrl: result.__videoUrl as string,
            cdnUrl: result.__cdnUrl as string,
          });
          accumulatedVideos.set(nId, existing);

          // Strip internal fields — don't apply per-iteration to prevent overwriting
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(result)) {
            if (!k.startsWith('__')) clean[k] = v;
          }
          useExecutionStore.getState().setNodeResult(nId, clean);
          return clean;
        }

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
      onBatchProgress: (current, total) => {
        // current is 1-indexed (called before iteration starts)
        const currentIndex = current - 1;
        const currentItemText = values[currentIndex] ?? '';
        // After each successful iteration, add unit price to running cost
        if (current > 1 && downstreamUnitPrice != null) {
          runningCost += downstreamUnitPrice;
        }
        useExecutionStore.getState().setBatchProgress(
          batchNodeId, current, total, runningCost, currentItemText,
        );
      },
    });

    // Write accumulated images to each Image Generator node
    for (const [nId, batchImages] of accumulatedImages) {
      const node = nodes.find((n) => n.id === nId);
      const existingImages = batchData.appendMode
        ? ((node?.data as Record<string, unknown>)?.images as Array<{ url: string; width: number; height: number }>) ?? []
        : [];
      useCanvasStore.getState().updateNodeData(nId, {
        images: [...existingImages, ...batchImages],
        selectedImageIndex: 0,
      });
    }

    // Write accumulated videos to each video node
    for (const [nId, videos] of accumulatedVideos) {
      const node = nodes.find((n) => n.id === nId);
      const existingVideos = batchData.appendMode
        ? ((node?.data as Record<string, unknown>)?.videoResults as Array<{ videoUrl: string; cdnUrl: string }>) ?? []
        : [];
      useCanvasStore.getState().updateNodeData(nId, {
        videoResults: [...existingVideos, ...videos],
        videoUrl: videos[videos.length - 1]?.videoUrl ?? null,
        cdnUrl: videos[videos.length - 1]?.cdnUrl ?? null,
      });
    }

    // Handle append mode: concatenate with existing results if appendMode is true
    let finalResults: BatchResultItem[];
    if (batchData.appendMode && batchData.batchResults) {
      finalResults = [...batchData.batchResults, ...batchResults];
    } else {
      finalResults = batchResults;
    }

    // Store results on the batch node via registry
    applyNodeResult(
      'batchParameter',
      batchNodeId,
      { __batchResults: finalResults },
      useCanvasStore.getState().updateNodeData,
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Cancelled — keep completed results
    } else {
      console.error('Batch execution error:', err);
    }
  } finally {
    useExecutionStore.getState().cancelExecution();
    useExecutionStore.getState().clearBatchProgress(batchNodeId);
  }
}

/**
 * Retry only the failed items from a previous batch execution.
 * Re-runs failed iterations and merges results in-place at original indices.
 */
export async function retryFailedBatchItems(batchNodeId: string): Promise<void> {
  const { nodes, edges } = useCanvasStore.getState();
  const execStore = useExecutionStore.getState();

  const batchNode = nodes.find((n) => n.id === batchNodeId);
  if (!batchNode) throw new Error(`Batch node not found: ${batchNodeId}`);

  const batchData = batchNode.data as unknown as BatchParameterData;
  const existingResults = batchData.batchResults ?? [];

  // Find failed items with their original indices
  const failedItems = existingResults
    .map((r, idx) => ({ ...r, arrayIndex: idx }))
    .filter((r) => r.status === 'error');

  if (failedItems.length === 0) return;

  const failedValues = failedItems.map((r) => r.inputValue);

  // Get downstream subgraph
  const nodeIds = nodes.map((n) => n.id);
  const edgesSimple = edges.map((e) => ({
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? '',
    targetHandle: e.targetHandle ?? '',
  }));

  const sortedIds = getDownstreamNodes(batchNodeId, nodeIds, edgesSimple);

  // Start execution
  const controller = execStore.startExecution();
  const signal = controller.signal;

  for (const id of sortedIds) {
    if (id !== batchNodeId) {
      useExecutionStore.getState().setNodeStatus(id, 'pending');
    }
  }

  // Accumulate images/videos for retried items
  const accumulatedImages = new Map<string, Array<{ url: string; width: number; height: number }>>();
  const accumulatedVideos = new Map<string, Array<{ videoUrl: string; cdnUrl: string }>>();

  let runningCost = 0;
  const downstreamUnitPrice = getDownstreamUnitPrice(batchNodeId, nodes, edges);

  try {
    const retryResults = await executeDagBatch({
      values: failedValues,
      batchNodeId,
      batchOutputHandle: 'text-source-0',
      errorMode: batchData.errorMode ?? 'skip',
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

        if (nodeType === 'imageGenerator' && result.__images) {
          const existing = accumulatedImages.get(nId) ?? [];
          existing.push(...(result.__images as Array<{ url: string; width: number; height: number }>));
          accumulatedImages.set(nId, existing);
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(result)) {
            if (!k.startsWith('__')) clean[k] = v;
          }
          useExecutionStore.getState().setNodeResult(nId, clean);
          return clean;
        }

        if ((nodeType === 'textToVideo' || nodeType === 'imageToVideo') && result.__videoUrl) {
          const existing = accumulatedVideos.get(nId) ?? [];
          existing.push({
            videoUrl: result.__videoUrl as string,
            cdnUrl: result.__cdnUrl as string,
          });
          accumulatedVideos.set(nId, existing);
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(result)) {
            if (!k.startsWith('__')) clean[k] = v;
          }
          useExecutionStore.getState().setNodeResult(nId, clean);
          return clean;
        }

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
      onBatchProgress: (current, total) => {
        const currentIndex = current - 1;
        const currentItemText = failedValues[currentIndex] ?? '';
        if (current > 1 && downstreamUnitPrice != null) {
          runningCost += downstreamUnitPrice;
        }
        useExecutionStore.getState().setBatchProgress(
          batchNodeId, current, total, runningCost, currentItemText,
        );
      },
    });

    // Merge retry results into existing results at original indices
    const mergedResults = [...existingResults];
    for (let i = 0; i < retryResults.length; i++) {
      const originalIndex = failedItems[i].arrayIndex;
      mergedResults[originalIndex] = {
        ...retryResults[i],
        index: failedItems[i].index, // preserve original batch index
      };
    }

    // Merge accumulated images into existing node arrays at correct positions
    for (const [nId, retryImages] of accumulatedImages) {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === nId);
      const currentImages = ((node?.data as Record<string, unknown>)?.images as Array<{ url: string; width: number; height: number }>) ?? [];
      // Replace images at failed indices with retry results
      const updatedImages = [...currentImages];
      let retryIdx = 0;
      for (const failedItem of failedItems) {
        if (retryIdx < retryImages.length) {
          updatedImages[failedItem.arrayIndex] = retryImages[retryIdx];
          retryIdx++;
        }
      }
      useCanvasStore.getState().updateNodeData(nId, {
        images: updatedImages,
        selectedImageIndex: 0,
      });
    }

    // Merge accumulated videos into existing node arrays at correct positions
    for (const [nId, retryVideos] of accumulatedVideos) {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === nId);
      const currentVideos = ((node?.data as Record<string, unknown>)?.videoResults as Array<{ videoUrl: string; cdnUrl: string }>) ?? [];
      const updatedVideos = [...currentVideos];
      let retryIdx = 0;
      for (const failedItem of failedItems) {
        if (retryIdx < retryVideos.length) {
          updatedVideos[failedItem.arrayIndex] = retryVideos[retryIdx];
          retryIdx++;
        }
      }
      useCanvasStore.getState().updateNodeData(nId, {
        videoResults: updatedVideos,
        videoUrl: updatedVideos[updatedVideos.length - 1]?.videoUrl ?? null,
        cdnUrl: updatedVideos[updatedVideos.length - 1]?.cdnUrl ?? null,
      });
    }

    // Store merged results on the batch node
    applyNodeResult(
      'batchParameter',
      batchNodeId,
      { __batchResults: mergedResults },
      useCanvasStore.getState().updateNodeData,
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Cancelled — keep completed results
    } else {
      console.error('Batch retry error:', err);
    }
  } finally {
    useExecutionStore.getState().cancelExecution();
    useExecutionStore.getState().clearBatchProgress(batchNodeId);
  }
}

export { executors };
