'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type NodeProps, Position } from '@xyflow/react';
import { Type } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import type { TextInputData } from '@/types/canvas';

export function TextInputNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as TextInputData;
  const [localValue, setLocalValue] = useState(nodeData.value ?? '');
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from store when value changes externally
  useEffect(() => {
    setLocalValue(nodeData.value ?? '');
  }, [nodeData.value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalValue(val);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNodeData(id, { value: val });
      }, 300);
    },
    [id, updateNodeData]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 200,
        position: 'relative',
        boxShadow: selected
          ? '0 0 0 2px #ae53ba, 0 0 12px rgba(174, 83, 186, 0.3)'
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          userSelect: 'none',
        }}
      >
        <Type size={14} color="#ae53ba" />
        <span
          style={{
            color: '#f3f4f6',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Text Input
        </span>
      </div>

      {/* Textarea */}
      <textarea
        className="nodrag nowheel"
        value={localValue}
        onChange={handleChange}
        placeholder="Enter your text..."
        style={{
          width: '100%',
          minHeight: 80,
          maxHeight: 120,
          resize: 'vertical',
          background: '#111111',
          border: '1px solid #333',
          borderRadius: 6,
          padding: 8,
          color: '#e5e7eb',
          fontSize: 13,
          lineHeight: 1.4,
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => {
          (e.target as HTMLTextAreaElement).style.borderColor = '#ae53ba';
        }}
        onBlur={(e) => {
          (e.target as HTMLTextAreaElement).style.borderColor = '#333';
        }}
      />

      {/* Output port */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType="text"
        portId="text-source-0"
        index={0}
        style={{ top: '50%' }}
      />
    </div>
  );
}
