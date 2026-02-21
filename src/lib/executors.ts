/**
 * Node executor registry — maps node type strings to async executor functions.
 *
 * Orchestrates single-node and full-workflow execution using the DAG engine,
 * fal.ai client, and execution/canvas stores.
 */

import { fal } from '@/lib/fal/client';
import { classifyFalError } from '@/lib/fal/error-classifier';
import {
  topologicalSort,
  detectCycle,
  getUpstreamNodes,
  executeDag,
  CycleError,
} from '@/lib/dag';
import { useCanvasStore } from '@/stores/canvas-store';
import { useExecutionStore } from '@/stores/execution-store';
import type {
  TextInputData,
  ImageImportData,
  ImageGeneratorData,
} from '@/types/canvas';

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
    (inputs['text-in-0'] as string) ?? data.prompt ?? '';

  if (!resolvedPrompt.trim()) {
    throw new Error('No prompt provided for image generation');
  }

  // Resolve image input (for image-to-image workflows)
  const imageInputUrl = inputs['image-in-0'] as string | undefined;

  // Build fal.ai input
  const falInput: Record<string, unknown> = {
    prompt: resolvedPrompt,
    image_size: ASPECT_RATIO_PRESETS[aspectRatio] || { width: 1024, height: 1024 },
    num_images: numImages,
  };
  if (imageInputUrl) {
    falInput.image_url = imageInputUrl;
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

    return { 'image-out-0': images };
  } catch (err) {
    // Check if cancelled
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

        // Update node data with results (e.g., generated images)
        if (nodeType === 'imageGenerator' && result['image-out-0']) {
          useCanvasStore
            .getState()
            .updateNodeData(nId, {
              images: result['image-out-0'],
            });
        }

        // Store result in execution store
        useExecutionStore.getState().setNodeResult(nId, result);

        return result;
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

        // Update node data with results (e.g., generated images)
        if (nodeType === 'imageGenerator' && result['image-out-0']) {
          useCanvasStore
            .getState()
            .updateNodeData(nId, {
              images: result['image-out-0'],
            });
        }

        // Store result in execution store
        useExecutionStore.getState().setNodeResult(nId, result);

        return result;
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
