'use client';

import { type EdgeProps, getBezierPath } from '@xyflow/react';
import { PORT_TYPES, getPortTypeFromHandleId } from '@/lib/port-types';

export function TurboEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const portType = getPortTypeFromHandleId(sourceHandleId ?? null);
  const color = portType ? PORT_TYPES[portType].color : undefined;
  const gradientId = `turbo-edge-gradient-${id}`;

  const strokeWidth = selected ? 3 : 2;

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color ?? '#ae53ba'} />
          <stop offset="100%" stopColor={color ?? '#2a8af6'} />
        </linearGradient>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path react-flow__edge-path-animated"
        d={edgePath}
        fill="none"
        stroke={color ? color : `url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray="5 5"
      />
    </>
  );
}
