/**
 * Node executor registry — maps node type strings to async executor functions.
 *
 * Orchestrates single-node and full-workflow execution using the DAG engine,
 * fal.ai client, and execution/canvas stores.
 */

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
import type { BatchParameterData, BatchResultItem } from '@/types/canvas';
import {
  createAccumulationMaps,
  accumulateResult,
  writeAccumulatedImages,
  writeAccumulatedVideos,
} from './batch-helpers';

// Re-export the type for downstream consumers
export type { NodeExecutor } from './types';

// Import all executors
import { textInputExecutor } from './text-input';
import { imageImportExecutor } from './image-import';
import { imageGeneratorExecutor } from './image-generator';
import { llmAssistantExecutor } from './llm-assistant';
import { imageUpscaleExecutor } from './image-upscale';
import { textToVideoExecutor } from './text-to-video';
import { imageToVideoExecutor } from './image-to-video';
import { batchParameterExecutor } from './batch-parameter';
import { canvasNoteExecutor } from './canvas-note';
import { textDisplayExecutor } from './text-display';
import { webglSnapshotExecutor } from './webgl-snapshot';

import type { NodeExecutor } from './types';

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
  batchParameter: batchParameterExecutor,
  canvasNote: canvasNoteExecutor,
  textDisplay: textDisplayExecutor,
  webglSnapshot: webglSnapshotExecutor,
};

// ---------------------------------------------------------------------------
// Internal dispatch
// ---------------------------------------------------------------------------

/**
 * Execute a single node by its type, given its data and resolved inputs.
 */
async function executeNodeByType(
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

  const upstreamIds = getUpstreamNodes(nodeId, nodeIds, edgesSimple);
  const downstreamIds = getDownstreamNodes(nodeId, nodeIds, edgesSimple);
  // Merge: upstream (includes nodeId) + downstream (excludes nodeId to avoid dup)
  const sortedIds = [...upstreamIds, ...downstreamIds.filter((id) => id !== nodeId)];

  // Start execution
  const controller = execStore.startExecution();
  const signal = controller.signal;

  // Build cached results from upstream nodes that already have 'done' status.
  // The target node itself and all downstream nodes are never cached — they must re-execute
  // to receive fresh data from the target node.
  // Source nodes (no incoming edges) are never cached — their data (imageUrl, prompt, etc.)
  // can change between executions without any signal to the execution store.
  const downstreamSet = new Set(downstreamIds);
  const nodesWithInputs = new Set(edges.map((e) => e.target));
  const cachedResults: Record<string, Record<string, unknown>> = {};
  for (const id of sortedIds) {
    if (id === nodeId || downstreamSet.has(id)) continue;
    if (!nodesWithInputs.has(id)) continue; // source nodes: always re-execute
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

  for (const id of sortedIds) {
    if (id !== batchNodeId) {
      useExecutionStore.getState().setNodeStatus(id, 'pending');
    }
  }

  const accMaps = createAccumulationMaps();
  let runningCost = 0;
  const downstreamUnitPrice = getDownstreamUnitPrice(batchNodeId, nodes, edges);

  try {
    const batchResults = await executeDagBatch({
      values,
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

        const acc = accumulateResult(nodeType, nId, result, accMaps, (id, r) =>
          useExecutionStore.getState().setNodeResult(id, r),
        );
        if (acc.accumulated) return acc.clean;

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
        const currentItemText = values[currentIndex] ?? '';
        if (current > 1 && downstreamUnitPrice != null) {
          runningCost += downstreamUnitPrice;
        }
        useExecutionStore.getState().setBatchProgress(
          batchNodeId, current, total, runningCost, currentItemText,
        );
      },
    });

    writeAccumulatedImages(accMaps.images, { mode: 'append', appendMode: batchData.appendMode });
    writeAccumulatedVideos(accMaps.videos, { mode: 'append', appendMode: batchData.appendMode });

    // Handle append mode: concatenate with existing results if appendMode is true
    let finalResults: BatchResultItem[];
    if (batchData.appendMode && batchData.batchResults) {
      finalResults = [...batchData.batchResults, ...batchResults];
    } else {
      finalResults = batchResults;
    }

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

  const failedItems = existingResults
    .map((r, idx) => ({ ...r, arrayIndex: idx }))
    .filter((r) => r.status === 'error');

  if (failedItems.length === 0) return;

  const failedValues = failedItems.map((r) => r.inputValue);

  const nodeIds = nodes.map((n) => n.id);
  const edgesSimple = edges.map((e) => ({
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? '',
    targetHandle: e.targetHandle ?? '',
  }));

  const sortedIds = getDownstreamNodes(batchNodeId, nodeIds, edgesSimple);

  const controller = execStore.startExecution();
  const signal = controller.signal;

  for (const id of sortedIds) {
    if (id !== batchNodeId) {
      useExecutionStore.getState().setNodeStatus(id, 'pending');
    }
  }

  const accMaps = createAccumulationMaps();
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

        const acc = accumulateResult(nodeType, nId, result, accMaps, (id, r) =>
          useExecutionStore.getState().setNodeResult(id, r),
        );
        if (acc.accumulated) return acc.clean;

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
        index: failedItems[i].index,
      };
    }

    writeAccumulatedImages(accMaps.images, { mode: 'merge-at-index', failedItems });
    writeAccumulatedVideos(accMaps.videos, { mode: 'merge-at-index', failedItems });

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
