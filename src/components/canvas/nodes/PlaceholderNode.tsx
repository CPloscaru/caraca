'use client';

import { type NodeProps, Position } from '@xyflow/react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import type { NodeData } from '@/types/canvas';

export function PlaceholderNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData;

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 160,
        position: 'relative',
        boxShadow: selected
          ? '0 0 0 2px #ae53ba, 0 0 12px rgba(174, 83, 186, 0.3)'
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      <div
        style={{
          color: '#f3f4f6',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        {nodeData.label}
      </div>

      {nodeData.inputs?.map((input, i) => (
        <TypedHandle
          key={`input-${input.type}-${i}`}
          type="target"
          position={Position.Left}
          portType={input.type}
          portId={input.id}
          index={i}
          style={{
            top: `${((i + 1) / (nodeData.inputs.length + 1)) * 100}%`,
          }}
        />
      ))}

      {nodeData.outputs?.map((output, i) => (
        <TypedHandle
          key={`output-${output.type}-${i}`}
          type="source"
          position={Position.Right}
          portType={output.type}
          portId={output.id}
          index={i}
          style={{
            top: `${((i + 1) / (nodeData.outputs.length + 1)) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
