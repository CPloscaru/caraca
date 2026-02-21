'use client';

import { useEffect, useRef } from 'react';
import { PORT_TYPES, type PortType } from '@/lib/port-types';
import type { PortDefinition } from '@/types/canvas';

type ContextMenuPosition = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
};

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
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: PORT_TYPES[type].color,
        marginRight: 2,
      }}
    />
  );
}

type ContextMenuProps = {
  position: ContextMenuPosition | null;
  onClose: () => void;
  onAddNode: (template: NodeTemplate, flowX: number, flowY: number) => void;
};

export function ContextMenu({ position, onClose, onAddNode }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Delay listener attachment to avoid the context menu click itself closing the menu
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  if (!position) return null;

  // Boundary detection: ensure menu stays within viewport
  const menuWidth = 200;
  const menuHeight = NODE_TEMPLATES.length * 44 + 16;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const top = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        top,
        width: menuWidth,
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        padding: '4px 0',
        zIndex: 1000,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          fontSize: 11,
          color: '#9ca3af',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Add Node
      </div>
      {NODE_TEMPLATES.map((template) => (
        <button
          key={template.label}
          onClick={() => {
            onAddNode(template, position.flowX, position.flowY);
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            color: '#f3f4f6',
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.1s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              'rgba(174, 83, 186, 0.1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <span>{template.label}</span>
          <span style={{ display: 'flex', gap: 2 }}>
            {template.inputs.map((inp, i) => (
              <PortDot key={`in-${i}`} type={inp.type} />
            ))}
            {template.outputs.map((out, i) => (
              <PortDot key={`out-${i}`} type={out.type} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

export type { ContextMenuPosition, NodeTemplate };
