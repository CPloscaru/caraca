'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SchemaNode } from '@/lib/fal/schema-tree';

type SchemaTreeViewProps = {
  tree: SchemaNode[];
};

const KIND_COLORS: Record<string, string> = {
  string: 'text-green-400',
  number: 'text-blue-400',
  integer: 'text-blue-300',
  boolean: 'text-amber-400',
  enum: 'text-purple-400',
  object: 'text-cyan-400',
  array: 'text-orange-400',
  unknown: 'text-gray-500',
};

function TreeNode({ node, depth = 0 }: { node: SchemaNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren =
    (node.kind === 'object' && node.children && node.children.length > 0) ||
    (node.kind === 'array' && node.itemSchema);

  const kindColor = KIND_COLORS[node.kind] ?? 'text-gray-400';

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      <div className="flex items-center gap-1 py-0.5">
        {hasChildren ? (
          <button
            type="button"
            className="nodrag flex-shrink-0"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown
              className={`h-2.5 w-2.5 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`}
            />
          </button>
        ) : (
          <span className="inline-block w-2.5" />
        )}
        <span className="text-[10px] text-gray-300">{node.name}</span>
        <span className={`text-[9px] ${kindColor}`}>{node.kind}</span>
        {node.required && (
          <span className="text-[8px] text-amber-500">req</span>
        )}
        {node.nullable && (
          <span className="text-[8px] text-gray-600">null</span>
        )}
        {node.enum && (
          <span className="text-[8px] text-gray-600">
            [{node.enum.length}]
          </span>
        )}
        {node.minimum != null && node.maximum != null && (
          <span className="text-[8px] text-gray-600">
            {node.minimum}..{node.maximum}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div className="border-l border-white/5 ml-1">
          {node.kind === 'object' && node.children?.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
          {node.kind === 'array' && node.itemSchema && (
            <TreeNode node={node.itemSchema} depth={depth + 1} />
          )}
        </div>
      )}
    </div>
  );
}

export function SchemaTreeView({ tree }: SchemaTreeViewProps) {
  if (!tree || tree.length === 0) {
    return <div className="text-[10px] text-gray-600">No schema tree available</div>;
  }

  return (
    <div className="font-mono">
      {tree.map((node) => (
        <TreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}
