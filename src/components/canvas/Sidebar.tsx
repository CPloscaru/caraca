'use client';

import { type DragEvent, useMemo } from 'react';
import { StickyNote } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { PORT_TYPES, type PortType } from '@/lib/port-types';
import { getNodeTemplates, type NodeTemplate } from '@/lib/node-registry';

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

/** Tool node types that appear in the "Outils" section instead of the main palette */
const TOOL_NODE_TYPES = new Set(['canvasNote']);

function NodeEntry({ template, onDragStart }: { template: NodeTemplate; onDragStart: (e: DragEvent<HTMLDivElement>, t: NodeTemplate) => void }) {
  const isTool = TOOL_NODE_TYPES.has(template.nodeType);

  return (
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
          marginBottom: isTool ? 0 : 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {isTool && <StickyNote size={14} color="#ae53ba" />}
        {template.label}
      </div>
      {!isTool && (
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
      )}
    </div>
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

  const allTemplates = useMemo(() => getNodeTemplates(), []);
  const processingNodes = useMemo(() => allTemplates.filter((t) => !TOOL_NODE_TYPES.has(t.nodeType)), [allTemplates]);
  const toolNodes = useMemo(() => allTemplates.filter((t) => TOOL_NODE_TYPES.has(t.nodeType)), [allTemplates]);

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
      {processingNodes.map((template) => (
        <NodeEntry key={template.label} template={template} onDragStart={onDragStart} />
      ))}

      {toolNodes.length > 0 && (
        <>
          <div
            style={{
              padding: '12px 12px 8px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9ca3af',
              borderTop: '1px solid #2a2a2a',
              marginTop: 4,
            }}
          >
            Outils
          </div>
          {toolNodes.map((template) => (
            <NodeEntry key={template.label} template={template} onDragStart={onDragStart} />
          ))}
        </>
      )}
    </div>
  );
}
