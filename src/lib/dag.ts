/**
 * DAG execution engine — pure logic, zero React/Zustand dependencies.
 *
 * Provides topological sort, cycle detection, upstream resolution,
 * and sequential DAG execution with cancellation support.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeStatus = 'idle' | 'pending' | 'running' | 'done' | 'error';

export class CycleError extends Error {
  cyclePath: string[];

  constructor(cyclePath: string[]) {
    super(`Cycle detected: ${cyclePath.join(' → ')}`);
    this.name = 'CycleError';
    this.cyclePath = cyclePath;
  }
}

export type ExecuteDagConfig = {
  sortedNodeIds: string[];
  edges: Array<{
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }>;
  executeNode: (
    nodeId: string,
    inputs: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<Record<string, unknown>>;
  signal: AbortSignal;
  onStatusChange: (nodeId: string, status: NodeStatus) => void;
};

// ---------------------------------------------------------------------------
// Topological Sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

/**
 * Returns node IDs in topological order (upstream-first).
 * Handles disconnected components.
 * Throws `CycleError` if the graph contains a cycle.
 */
export function topologicalSort(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const { source, target } of edges) {
    adjacency.get(source)?.push(target);
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== nodeIds.length) {
    // There is a cycle — find it for reporting purposes
    const cycle = detectCycle(nodeIds, edges);
    throw new CycleError(cycle ?? ['unknown']);
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Cycle Detection (DFS)
// ---------------------------------------------------------------------------

/**
 * Returns the cycle path as an array of node IDs, or null if no cycle exists.
 */
export function detectCycle(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) {
    adjacency.set(id, []);
  }
  for (const { source, target } of edges) {
    adjacency.get(source)?.push(target);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(node: string): string[] | null {
    visited.add(node);
    recStack.add(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        parent.set(neighbor, node);
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      } else if (recStack.has(neighbor)) {
        // Reconstruct cycle path
        const path: string[] = [neighbor];
        let current = node;
        while (current !== neighbor) {
          path.push(current);
          current = parent.get(current)!;
        }
        path.push(neighbor);
        path.reverse();
        return path;
      }
    }

    recStack.delete(node);
    return null;
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Upstream Node Resolution
// ---------------------------------------------------------------------------

/**
 * Returns all transitive upstream dependencies of `nodeId`, topologically
 * sorted (upstream-first), with `nodeId` itself at the end.
 */
export function getUpstreamNodes(
  nodeId: string,
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
): string[] {
  // Build reverse adjacency (target → sources)
  const reverseAdj = new Map<string, string[]>();
  for (const id of nodeIds) {
    reverseAdj.set(id, []);
  }
  for (const { source, target } of edges) {
    reverseAdj.get(target)?.push(source);
  }

  // BFS to find all upstream nodes
  const upstream = new Set<string>();
  const queue: string[] = [nodeId];
  upstream.add(nodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const parent of reverseAdj.get(current) ?? []) {
      if (!upstream.has(parent)) {
        upstream.add(parent);
        queue.push(parent);
      }
    }
  }

  // Filter relevant edges and topologically sort the subgraph
  const subEdges = edges.filter(
    (e) => upstream.has(e.source) && upstream.has(e.target),
  );
  const subNodes = Array.from(upstream);

  return topologicalSort(subNodes, subEdges);
}

// ---------------------------------------------------------------------------
// DAG Execution
// ---------------------------------------------------------------------------

/**
 * Executes nodes sequentially in topological order, resolving inputs from
 * upstream outputs via edge handle mappings.
 *
 * Returns a results map: nodeId → executeNode return value.
 */
export async function executeDag(
  config: ExecuteDagConfig,
): Promise<Record<string, unknown>> {
  const { sortedNodeIds, edges, executeNode, signal, onStatusChange } = config;
  const results: Record<string, Record<string, unknown>> = {};
  const failedNodes = new Set<string>();

  for (const nodeId of sortedNodeIds) {
    // Check cancellation before each node
    if (signal.aborted) {
      throw new DOMException('Execution was cancelled', 'AbortError');
    }

    // Check if any upstream dependency failed — skip this node if so
    const hasFailedUpstream = edges
      .filter((e) => e.target === nodeId)
      .some((e) => failedNodes.has(e.source));

    if (hasFailedUpstream) {
      failedNodes.add(nodeId);
      results[nodeId] = { __error: 'Skipped: upstream node failed' };
      onStatusChange(nodeId, 'error');
      continue;
    }

    // Resolve inputs from upstream outputs via edge mappings
    const inputs: Record<string, unknown> = {};
    for (const edge of edges) {
      if (edge.target === nodeId) {
        const upstreamResult = results[edge.source];
        if (upstreamResult && edge.sourceHandle in upstreamResult) {
          inputs[edge.targetHandle] = upstreamResult[edge.sourceHandle];
        }
      }
    }

    onStatusChange(nodeId, 'running');

    try {
      const result = await executeNode(nodeId, inputs, signal);
      results[nodeId] = result;
      onStatusChange(nodeId, 'done');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err; // Re-throw cancellation — stops everything
      }
      const message = err instanceof Error ? err.message : String(err);
      results[nodeId] = { __error: message };
      failedNodes.add(nodeId);
      onStatusChange(nodeId, 'error');
      // Continue to next node — independent branches keep executing
    }
  }

  return results as Record<string, unknown>;
}
