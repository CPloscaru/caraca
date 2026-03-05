import type { Node, Edge } from '@xyflow/react';
import { getRegistryEntry } from '@/lib/node-registry';
import { PORT_TYPES, type PortType } from '@/lib/port-types';

type WorkflowDiagramProps = {
  nodes: Node[];
  edges: Edge[];
  gradient: string;
  height?: number;
};

const NODE_H = 26;
const PAD_X = 14;
const PAD_Y = 14;
const CHAR_WIDTH = 6.2; // approx width per char at fontSize 10
const NODE_PAD_X = 14; // horizontal padding inside node pill
const FONT_SIZE = 10;
const MAX_NODES_FULL = 8;

type LayoutNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
};

function getNodeLabel(type: string): string {
  const entry = getRegistryEntry(type);
  return entry?.label ?? type;
}

function measureNodeWidth(label: string): number {
  return Math.round(label.length * CHAR_WIDTH + NODE_PAD_X * 2);
}

function layoutNodes(
  nodes: Node[],
  viewW: number,
  viewH: number,
): LayoutNode[] {
  if (nodes.length === 0) return [];

  const dense = nodes.length > MAX_NODES_FULL;
  const layouts: LayoutNode[] = nodes.map((n) => {
    const label = getNodeLabel(n.type ?? 'placeholder');
    const displayLabel = dense && label.length > 10 ? label.slice(0, 9) + '…' : label;
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: measureNodeWidth(displayLabel),
      label: displayLabel,
    };
  });

  if (layouts.length === 1) {
    layouts[0].x = (viewW - layouts[0].w) / 2;
    layouts[0].y = (viewH - NODE_H) / 2;
    return layouts;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.x > maxX) maxX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    if (n.position.y > maxY) maxY = n.position.y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const maxNodeW = Math.max(...layouts.map((l) => l.w));
  const areaW = viewW - 2 * PAD_X - maxNodeW;
  const areaH = viewH - 2 * PAD_Y - NODE_H;

  for (let i = 0; i < layouts.length; i++) {
    const normX = (nodes[i].position.x - minX) / rangeX;
    const normY = (nodes[i].position.y - minY) / rangeY;
    layouts[i].x = PAD_X + normX * areaW + (maxNodeW - layouts[i].w) / 2;
    layouts[i].y = PAD_Y + normY * areaH;
  }

  resolveOverlaps(layouts, viewW, viewH);
  return layouts;
}

const OVERLAP_GAP_X = 5;
const OVERLAP_GAP_Y = 4;

function rectsOverlap(a: LayoutNode, b: LayoutNode): boolean {
  return (
    a.x < b.x + b.w + OVERLAP_GAP_X &&
    a.x + a.w + OVERLAP_GAP_X > b.x &&
    a.y < b.y + NODE_H + OVERLAP_GAP_Y &&
    a.y + NODE_H + OVERLAP_GAP_Y > b.y
  );
}

function resolveOverlaps(layouts: LayoutNode[], viewW: number, viewH: number) {
  for (let iter = 0; iter < 40; iter++) {
    let anyOverlap = false;
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const a = layouts[i];
        const b = layouts[j];
        if (!rectsOverlap(a, b)) continue;
        anyOverlap = true;

        const overlapX = Math.min(a.x + a.w + OVERLAP_GAP_X - b.x, b.x + b.w + OVERLAP_GAP_X - a.x);
        const overlapY = Math.min(a.y + NODE_H + OVERLAP_GAP_Y - b.y, b.y + NODE_H + OVERLAP_GAP_Y - a.y);

        if (overlapX < overlapY) {
          const push = overlapX / 2 + 0.5;
          if (a.x < b.x || (a.x === b.x && i < j)) { a.x -= push; b.x += push; }
          else { a.x += push; b.x -= push; }
        } else {
          const push = overlapY / 2 + 0.5;
          if (a.y < b.y || (a.y === b.y && i < j)) { a.y -= push; b.y += push; }
          else { a.y += push; b.y -= push; }
        }
      }
    }
    for (const l of layouts) {
      l.x = Math.max(2, Math.min(viewW - l.w - 2, l.x));
      l.y = Math.max(2, Math.min(viewH - NODE_H - 2, l.y));
    }
    if (!anyOverlap) break;
  }
}

function getEdgeColor(sourceHandle: string | null | undefined): string {
  if (!sourceHandle) return '#aaa';
  const type = sourceHandle.split('-')[0] as PortType;
  return PORT_TYPES[type]?.color ?? '#aaa';
}

export function WorkflowDiagram({
  nodes,
  edges,
  gradient,
  height = 160,
}: WorkflowDiagramProps) {
  const viewW = 300;
  const viewH = height;
  const layouts = layoutNodes(nodes, viewW, viewH);
  const layoutMap = new Map(layouts.map((l) => [l.id, l]));

  return (
    <div
      style={{
        height,
        position: 'relative',
        borderBottom: '1px solid #2a2a2a',
      }}
    >
      {/* Gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: gradient,
        }}
      />
      {/* Dark overlay for contrast */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.35)',
        }}
      />
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', position: 'relative' }}
      >
        {/* Edges */}
        {edges.map((edge) => {
          const src = layoutMap.get(edge.source);
          const tgt = layoutMap.get(edge.target);
          if (!src || !tgt) return null;

          const x1 = src.x + src.w;
          const y1 = src.y + NODE_H / 2;
          const x2 = tgt.x;
          const y2 = tgt.y + NODE_H / 2;

          const leftToRight = x2 > x1 - 10;
          let d: string;
          if (leftToRight) {
            const cx = (x1 + x2) / 2;
            d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
          } else {
            const midY = (y1 + y2) / 2;
            d = `M ${x1} ${y1} C ${x1 + 20} ${y1}, ${x1 + 20} ${midY}, ${(x1 + x2) / 2} ${midY} S ${x2 - 20} ${y2}, ${x2} ${y2}`;
          }

          return (
            <path
              key={edge.id}
              d={d}
              fill="none"
              stroke={getEdgeColor(edge.sourceHandle)}
              strokeWidth={1.5}
              opacity={0.7}
            />
          );
        })}

        {/* Nodes */}
        {layouts.map((layout) => (
          <g key={layout.id}>
            {/* Shadow for depth */}
            <rect
              x={layout.x + 1}
              y={layout.y + 2}
              width={layout.w}
              height={NODE_H}
              rx={6}
              ry={6}
              fill="rgba(0, 0, 0, 0.3)"
            />
            {/* Node background */}
            <rect
              x={layout.x}
              y={layout.y}
              width={layout.w}
              height={NODE_H}
              rx={6}
              ry={6}
              fill="rgba(10, 10, 10, 0.85)"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={0.5}
            />
            <text
              x={layout.x + layout.w / 2}
              y={layout.y + NODE_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              fontSize={FONT_SIZE}
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight={500}
            >
              {layout.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
