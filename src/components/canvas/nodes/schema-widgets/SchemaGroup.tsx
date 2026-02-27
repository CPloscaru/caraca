'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ChevronDown } from 'lucide-react';
import type { SchemaNode } from '@/lib/fal/schema-tree';
import { isImageNode, isImageArrayNode, isTextNode } from '@/lib/fal/schema-ports';
import { SchemaNodeRenderer } from './SchemaNodeRenderer';

type SchemaGroupProps = {
  node: SchemaNode;
  values: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
  renderImagePort?: (node: SchemaNode) => ReactNode;
  renderTextPort?: (node: SchemaNode) => ReactNode;
};

/**
 * Recursively collect handle IDs from schema children.
 */
function collectHandleIds(children: SchemaNode[]): string[] {
  const ids: string[] = [];
  for (const child of children) {
    if (isImageNode(child) || isImageArrayNode(child)) {
      ids.push(`image-target-${child.path}`);
    }
    if (isTextNode(child)) {
      ids.push(`text-target-${child.path}`);
    }
    if (child.kind === 'object' && child.children) {
      ids.push(...collectHandleIds(child.children));
    }
  }
  return ids;
}

/**
 * Renders a nested object group as a collapsible section.
 * All children (including image fields) are rendered inside the group.
 */
export function SchemaGroup({ node, values, onChange, renderImagePort, renderTextPort }: SchemaGroupProps) {
  const [open, setOpen] = useState(true);

  // Proxy handle IDs for collapsed state (must be before early return)
  const proxyHandleIds = useMemo(() => {
    if (open || !node.children) return [];
    return collectHandleIds(node.children);
  }, [open, node.children]);

  if (!node.children || node.children.length === 0) return null;

  const label = node.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="mb-1.5 rounded-md border border-white/10 bg-white/[0.02]">
      {/* Header — relative so proxy handles position against it */}
      <div className="relative">
        <button
          type="button"
          className="nodrag flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            className={`h-3 w-3 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            {label}
          </span>
          {node.required && (
            <span className="text-[9px] text-amber-500">*</span>
          )}
        </button>
        {/* Proxy handles when collapsed — wires point to header */}
        {!open && proxyHandleIds.map((id) => (
          <Handle
            key={id}
            type="target"
            position={Position.Left}
            id={id}
            style={{ left: 0, opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0 }}
          />
        ))}
      </div>

      {/* Content only rendered when open */}
      {open && (
        <div className="space-y-1 border-t border-white/5 px-2.5 py-2">
          {node.children.map((child) => (
            <SchemaNodeRenderer
              key={child.path}
              node={child}
              values={values}
              onChange={onChange}
              renderImagePort={renderImagePort}
              renderTextPort={renderTextPort}
            />
          ))}
        </div>
      )}
    </div>
  );
}
