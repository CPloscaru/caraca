'use client';

import { type DragEvent } from 'react';
import { useAppStore } from '@/stores/app-store';
import { PORT_TYPES, type PortType } from '@/lib/port-types';
import type { PortDefinition } from '@/types/canvas';

type NodeTemplate = {
  label: string;
  nodeType: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
};

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    label: 'Text Input',
    nodeType: 'textInput',
    inputs: [],
    outputs: [{ type: 'text', label: 'Text', id: 'text-out-0' }],
  },
  {
    label: 'Image Import',
    nodeType: 'imageImport',
    inputs: [],
    outputs: [{ type: 'image', label: 'Image', id: 'image-out-0' }],
  },
  {
    label: 'Image Generator',
    nodeType: 'placeholder',
    inputs: [
      { type: 'text', label: 'Prompt', id: 'text-in-0' },
      { type: 'image', label: 'Reference', id: 'image-in-0' },
    ],
    outputs: [{ type: 'image', label: 'Output', id: 'image-out-0' }],
  },
  {
    label: 'LLM Assistant',
    nodeType: 'placeholder',
    inputs: [{ type: 'text', label: 'Input', id: 'text-in-0' }],
    outputs: [{ type: 'text', label: 'Response', id: 'text-out-0' }],
  },
];

function PortDot({ type }: { type: PortType }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: PORT_TYPES[type].color,
        marginRight: 2,
      }}
    />
  );
}

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  const onDragStart = (event: DragEvent<HTMLDivElement>, template: NodeTemplate) => {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        nodeType: template.nodeType,
        label: template.label,
        inputs: template.inputs,
        outputs: template.outputs,
      })
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  if (!sidebarOpen) return null;

  return (
    <div
      style={{
        width: 240,
        background: '#1a1a1a',
        borderRight: '1px solid #2a2a2a',
        padding: '12px 0',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '0 12px 8px',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#9ca3af',
        }}
      >
        Node Palette
      </div>
      {NODE_TEMPLATES.map((template) => (
        <div
          key={template.label}
          draggable
          onDragStart={(e) => onDragStart(e, template)}
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid #2a2a2a',
            cursor: 'grab',
            transition: 'background 0.15s ease',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              'rgba(174, 83, 186, 0.08)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <div
            style={{
              color: '#f3f4f6',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {template.label}
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#9ca3af' }}>
            {template.inputs.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {template.inputs.map((inp, i) => (
                  <PortDot key={`in-${i}`} type={inp.type} />
                ))}
                <span>in</span>
              </span>
            )}
            {template.outputs.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {template.outputs.map((out, i) => (
                  <PortDot key={`out-${i}`} type={out.type} />
                ))}
                <span>out</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
