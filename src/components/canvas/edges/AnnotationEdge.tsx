'use client';

import { type EdgeProps, getBezierPath } from '@xyflow/react';

/**
 * Dashed annotation edge used to visually link note nodes to other nodes.
 * Purely decorative — does not carry data and is filtered out during execution.
 */
export function AnnotationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <defs>
        <marker
          id={`annotation-arrow-${id}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(174, 83, 186, 0.5)" />
        </marker>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke="rgba(174, 83, 186, 0.5)"
        strokeWidth={1.5}
        strokeDasharray="8 4"
        markerEnd={`url(#annotation-arrow-${id})`}
      />
    </>
  );
}
