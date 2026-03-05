import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import { getScalarOutput } from '@/lib/webgl/scalar-map';

/**
 * Find a scalar edge targeting a specific handle on this node.
 * Returns the edge key (`${source}:${sourceHandle}`) or null.
 */
export function findScalarEdge(
  edges: Edge[],
  nodeId: string,
  targetHandle: string,
): string | null {
  const edge = edges.find(
    e => e.target === nodeId && e.targetHandle === targetHandle,
  );
  if (!edge) return null;
  return `${edge.source}:${edge.sourceHandle}`;
}

/**
 * Read a scalar value from the scalar map if an edge exists.
 * Returns the scalar value, or undefined if no edge or no value.
 */
export function readScalarFromEdge(
  edges: Edge[],
  nodeId: string,
  targetHandle: string,
): number | undefined {
  const key = findScalarEdge(edges, nodeId, targetHandle);
  if (!key) return undefined;
  return getScalarOutput(key);
}

/**
 * Hook to memoize scalar edge keys for a set of target handles.
 * Returns a record mapping handle ID to edge key (or null).
 */
export function useScalarEdgeKeys(
  edges: Edge[],
  nodeId: string,
  handles: string[],
): Record<string, string | null> {
  return useMemo(() => {
    const result: Record<string, string | null> = {};
    for (const h of handles) {
      result[h] = findScalarEdge(edges, nodeId, h);
    }
    return result;
  }, [edges, nodeId, handles]);
}
