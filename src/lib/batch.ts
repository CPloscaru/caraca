/**
 * Batch execution orchestration — pure logic, zero React/Zustand dependencies.
 *
 * Wraps executeDag() in a loop, running the downstream subgraph once per
 * batch value. Supports skip-on-error and stop-on-error modes.
 */

import { executeDag, type ExecuteDagConfig } from './dag';
import type { BatchResultItem } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExecuteDagBatchConfig = {
  values: string[];
  batchNodeId: string;
  batchOutputHandle: string; // e.g. 'text-source-0'
  errorMode: 'skip' | 'stop';
  // Pass through to executeDag
  sortedNodeIds: string[];
  edges: ExecuteDagConfig['edges'];
  executeNode: ExecuteDagConfig['executeNode'];
  signal: AbortSignal;
  onStatusChange: ExecuteDagConfig['onStatusChange'];
  onBatchProgress: (current: number, total: number) => void;
};

// ---------------------------------------------------------------------------
// Batch execution
// ---------------------------------------------------------------------------

/**
 * Executes the downstream DAG once per value, collecting results.
 *
 * - Each iteration gets a fresh cachedResults with only the batch node's value.
 * - Skip-on-error (default): records the error and continues to the next value.
 * - Stop-on-error: breaks the loop on first error.
 * - AbortError (cancellation): breaks immediately, preserving partial results.
 */
export async function executeDagBatch(
  config: ExecuteDagBatchConfig,
): Promise<BatchResultItem[]> {
  const results: BatchResultItem[] = [];

  for (let i = 0; i < config.values.length; i++) {
    if (config.signal.aborted) break;

    config.onBatchProgress(i + 1, config.values.length);

    // Inject current value as the batch node's cached result
    const cachedResults: Record<string, Record<string, unknown>> = {
      [config.batchNodeId]: {
        [config.batchOutputHandle]: config.values[i],
      },
    };

    // Filter sortedNodeIds to exclude the batch node itself
    const downstreamIds = config.sortedNodeIds.filter(
      (id) => id !== config.batchNodeId,
    );

    try {
      const dagResult = await executeDag({
        sortedNodeIds: downstreamIds,
        edges: config.edges,
        cachedResults,
        executeNode: config.executeNode,
        signal: config.signal,
        onStatusChange: config.onStatusChange,
      });

      results.push({
        index: i,
        inputValue: config.values[i],
        result: dagResult as Record<string, unknown>,
        error: null,
        status: 'done',
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        break; // User cancelled — preserve partial results
      }

      const message = err instanceof Error ? err.message : String(err);
      results.push({
        index: i,
        inputValue: config.values[i],
        result: null,
        error: message,
        status: 'error',
      });

      if (config.errorMode === 'stop') break;
    }
  }

  return results;
}
