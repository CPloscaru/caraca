'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Search, StickyNote } from 'lucide-react';
import { PORT_TYPES, type PortType } from '@/lib/port-types';
import { getNodeTemplates, type NodeTemplate } from '@/lib/node-registry';
import { useAppStore } from '@/stores/app-store';

/** Tool node types that appear in the "Outils" section */
const TOOL_NODE_TYPES = new Set(['canvasNote']);

type ContextMenuPosition = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
};

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

  const allTemplates = useMemo(() => getNodeTemplates(), []);
  const processingNodes = useMemo(() => allTemplates.filter((t) => !TOOL_NODE_TYPES.has(t.nodeType)), [allTemplates]);
  const toolNodes = useMemo(() => allTemplates.filter((t) => TOOL_NODE_TYPES.has(t.nodeType)), [allTemplates]);

  if (!position) return null;

  // Boundary detection: ensure menu stays within viewport
  const menuWidth = 200;
  const sectionHeaders = 2 + (toolNodes.length > 0 ? 1 : 0); // "Add Node" + "Outils" + search
  const menuHeight = allTemplates.length * 44 + sectionHeaders * 30 + 16;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const top = Math.min(position.y, window.innerHeight - menuHeight - 8);

  const renderNodeButton = (template: NodeTemplate) => {
    const isTool = TOOL_NODE_TYPES.has(template.nodeType);
    return (
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isTool && <StickyNote size={12} color="#ae53ba" />}
          {template.label}
        </span>
        {!isTool && (
          <span style={{ display: 'flex', gap: 2 }}>
            {template.inputs.map((inp, i) => (
              <PortDot key={`in-${i}`} type={inp.type} />
            ))}
            {template.outputs.map((out, i) => (
              <PortDot key={`out-${i}`} type={out.type} />
            ))}
          </span>
        )}
      </button>
    );
  };

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
      <button
        onClick={() => {
          onClose();
          useAppStore.getState().openCommandPalette();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid #2a2a2a',
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
        <Search size={14} style={{ color: '#9ca3af' }} />
        <span>Search Nodes...</span>
      </button>
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
      {processingNodes.map(renderNodeButton)}

      {toolNodes.length > 0 && (
        <>
          <div
            style={{
              padding: '6px 12px',
              fontSize: 11,
              color: '#9ca3af',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderTop: '1px solid #2a2a2a',
              marginTop: 2,
            }}
          >
            Outils
          </div>
          {toolNodes.map(renderNodeButton)}
        </>
      )}
    </div>
  );
}

export type { ContextMenuPosition };
