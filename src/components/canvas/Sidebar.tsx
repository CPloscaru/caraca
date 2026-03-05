'use client';

import { type DragEvent, useMemo, useState } from 'react';
import { ChevronDown, StickyNote } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { PORT_TYPES, type PortType } from '@/lib/port-types';
import {
  getNodeTemplates,
  groupBySubcategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type NodeCategory,
  type NodeTemplate,
} from '@/lib/node-registry';

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

function NodeEntry({ template, onDragStart }: { template: NodeTemplate; onDragStart: (e: DragEvent<HTMLDivElement>, t: NodeTemplate) => void }) {
  const isTool = template.category === 'tools';

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
  const [collapsed, setCollapsed] = useState<Set<NodeCategory>>(new Set());

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

  const grouped = useMemo(() => {
    const map = new Map<NodeCategory, NodeTemplate[]>();
    for (const t of allTemplates) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b]);
  }, [allTemplates]);

  const toggleCategory = (cat: NodeCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
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
      {grouped.map(([category, templates]) => {
        const isCollapsed = collapsed.has(category);
        return (
          <div key={category}>
            <button
              onClick={() => toggleCategory(category)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 12px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#9ca3af',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid #2a2a2a',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {CATEGORY_LABELS[category]}
              <ChevronDown
                size={14}
                style={{
                  transition: 'transform 0.15s ease',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                }}
              />
            </button>
            {!isCollapsed &&
              (() => {
                const hasSubcategories = templates.some((t) => t.subcategory);
                if (!hasSubcategories) {
                  return templates.map((template) => (
                    <NodeEntry key={template.label} template={template} onDragStart={onDragStart} />
                  ));
                }
                return groupBySubcategory(templates).map(([sub, subTemplates]) => (
                  <div key={sub ?? '_default'}>
                    {sub && (
                      <div
                        className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-gray-500"
                      >
                        {sub}
                      </div>
                    )}
                    {subTemplates.map((template) => (
                      <NodeEntry key={template.label} template={template} onDragStart={onDragStart} />
                    ))}
                  </div>
                ));
              })()}
          </div>
        );
      })}
    </div>
  );
}
