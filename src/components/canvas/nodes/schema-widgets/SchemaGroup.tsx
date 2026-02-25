'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SchemaNode } from '@/lib/fal/schema-tree';
import { SchemaNodeRenderer } from './SchemaNodeRenderer';

type SchemaGroupProps = {
  node: SchemaNode;
  values: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
};

/**
 * Renders a nested object group as a collapsible section.
 * Children are rendered recursively via SchemaNodeRenderer.
 */
export function SchemaGroup({ node, values, onChange }: SchemaGroupProps) {
  const [open, setOpen] = useState(false);

  if (!node.children || node.children.length === 0) return null;

  const label = node.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="mb-1.5 rounded-md border border-white/10 bg-white/[0.02]">
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
      {open && (
        <div className="space-y-1 border-t border-white/5 px-2.5 py-2">
          {node.children.map((child) => (
            <SchemaNodeRenderer
              key={child.path}
              node={child}
              values={values}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
