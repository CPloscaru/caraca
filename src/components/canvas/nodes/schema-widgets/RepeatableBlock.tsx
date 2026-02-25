'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import type { SchemaNode } from '@/lib/fal/schema-tree';
import { SchemaNodeRenderer } from './SchemaNodeRenderer';

type RepeatableBlockProps = {
  node: SchemaNode;
  values: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
};

/**
 * Renders an array-of-objects as repeatable blocks.
 * Each block contains the item schema's children rendered recursively.
 * Users can add/remove blocks.
 */
export function RepeatableBlock({ node, values, onChange }: RepeatableBlockProps) {
  const [open, setOpen] = useState(false);

  const itemSchema = node.itemSchema;
  const children = itemSchema?.kind === 'object' ? itemSchema.children : undefined;

  // Get current array value
  const items = useMemo(() => {
    const currentArray = getDeep(values, node.path);
    if (Array.isArray(currentArray)) return currentArray as Record<string, unknown>[];
    return [] as Record<string, unknown>[];
  }, [values, node.path]);

  const label = node.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const addItem = useCallback(() => {
    const newItems = [...items, {}];
    onChange(node.path, newItems);
  }, [items, node.path, onChange]);

  const removeItem = useCallback((index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(node.path, newItems);
  }, [items, node.path, onChange]);

  const handleChildChange = useCallback((itemIndex: number, childPath: string, value: unknown) => {
    const newItems = [...items];
    if (!newItems[itemIndex]) newItems[itemIndex] = {};
    const itemPrefix = `${node.path}.${itemIndex}.`;
    const fieldName = childPath.startsWith(itemPrefix)
      ? childPath.slice(itemPrefix.length)
      : childPath;
    setDeepInObject(newItems[itemIndex] as Record<string, unknown>, fieldName, value);
    onChange(node.path, newItems);
  }, [items, node.path, onChange]);

  if (!children || children.length === 0) return null;

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
        <span className="ml-auto text-[9px] text-gray-600">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/5 px-2.5 py-2">
          {items.map((item, index) => (
            <div
              key={index}
              className="mb-2 rounded border border-white/5 bg-white/[0.02] p-2"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[9px] font-medium text-gray-500">
                  #{index + 1}
                </span>
                <button
                  type="button"
                  className="nodrag text-gray-600 hover:text-red-400"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-1">
                {children.map((child) => {
                  const childPath = `${node.path}.${index}.${child.name}`;
                  const childValue = (item as Record<string, unknown>)?.[child.name];
                  return (
                    <SchemaNodeRenderer
                      key={childPath}
                      node={{ ...child, path: childPath }}
                      values={{ ...values, [childPath]: childValue }}
                      onChange={(path, value) => handleChildChange(index, path, value)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {(!node.maxItems || items.length < node.maxItems) && (
            <button
              type="button"
              className="nodrag flex w-full items-center justify-center gap-1 rounded border border-dashed border-white/10 py-1.5 text-[10px] text-gray-500 hover:border-white/20 hover:text-gray-400"
              onClick={addItem}
            >
              <Plus className="h-3 w-3" />
              Add {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Helpers
function getDeep(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      current = current[Number(seg)];
    } else {
      current = (current as Record<string, unknown>)[seg];
    }
  }
  return current;
}

function setDeepInObject(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!(seg in current) || current[seg] == null) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}
