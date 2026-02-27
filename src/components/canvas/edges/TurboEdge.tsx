'use client';

import { useState, useCallback, useRef, type MouseEvent } from 'react';
import { type EdgeProps, getBezierPath } from '@xyflow/react';
import { PORT_TYPES, getPortTypeFromHandleId } from '@/lib/port-types';
import { useCanvasStore } from '@/stores/canvas-store';

/** Find the closest point on an SVG path to a given (x, y) in SVG coords. */
function closestPointOnPath(path: SVGPathElement, x: number, y: number) {
  const len = path.getTotalLength();
  const steps = Math.max(60, Math.ceil(len / 4));
  let best = { x: 0, y: 0 };
  let bestDist = Infinity;
  for (let i = 0; i <= steps; i++) {
    const pt = path.getPointAtLength((i / steps) * len);
    const d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { x: pt.x, y: pt.y };
    }
  }
  return best;
}

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

  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const pathRef = useRef<SVGPathElement>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  const onGroupMove = useCallback((e: MouseEvent<SVGGElement>) => {
    const svg = (e.currentTarget as SVGGElement).closest('svg');
    if (!svg || !pathRef.current) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    const closest = closestPointOnPath(pathRef.current, svgPt.x, svgPt.y);
    setHoverPoint(closest);
  }, []);

  const onGroupLeave = useCallback(() => {
    setHoverPoint(null);
  }, []);

  const handleDelete = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    deleteEdge(id);
  }, [deleteEdge, id]);

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
      <g onMouseMove={onGroupMove} onMouseLeave={onGroupLeave}>
        {/* Invisible wider path for easier interaction */}
        <path
          d={edgePath}
          fill="none"
          strokeOpacity={0}
          strokeWidth={20}
          className="react-flow__edge-interaction"
        />
        <path
          ref={pathRef}
          id={id}
          className="react-flow__edge-path react-flow__edge-path-animated"
          d={edgePath}
          fill="none"
          stroke={color ? color : `url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray="5 5"
          style={{ pointerEvents: 'none' }}
        />
        {hoverPoint && (
          <foreignObject
            x={hoverPoint.x - 10}
            y={hoverPoint.y - 10}
            width={20}
            height={20}
            style={{ overflow: 'visible', pointerEvents: 'all' }}
          >
            <button
              onClick={handleDelete}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}
            >
              ×
            </button>
          </foreignObject>
        )}
      </g>
    </>
  );
}
