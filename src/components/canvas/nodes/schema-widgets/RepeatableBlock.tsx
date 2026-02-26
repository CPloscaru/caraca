'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import type { SchemaNode } from '@/lib/fal/schema-tree';
import { isImageNode, isImageArrayNode, isTextNode } from '@/lib/fal/schema-ports';
import { SchemaNodeRenderer } from './SchemaNodeRenderer';

type RepeatableBlockProps = {
  node: SchemaNode;
  values: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
  renderImagePort?: (node: SchemaNode) => ReactNode;
  renderTextPort?: (node: SchemaNode) => ReactNode;
};

/**
 * Collect all handle IDs from direct children of a repeatable block.
 * Used to render proxy handles on the header when collapsed.
 */
function collectChildHandleIds(
  children: SchemaNode[],
  itemCount: number,
  basePath: string,
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    for (const child of children) {
      const childPath = `${basePath}.${i}.${child.name}`;
      if (isImageNode(child) || isImageArrayNode(child)) {
        ids.push(`image-target-${childPath}`);
      }
      if (isTextNode(child)) {
        ids.push(`text-target-${childPath}`);
      }
    }
  }
  return ids;
}

/**
 * Renders an array-of-objects as repeatable blocks.
 * ALL children (including image handles) render inside each block card,
 * matching the fal.ai layout where each element contains its own images.
 */
export function RepeatableBlock({ node, values, onChange, renderImagePort, renderTextPort }: RepeatableBlockProps) {
  const itemSchema = node.itemSchema;
  const children = itemSchema?.kind === 'object' ? itemSchema.children : undefined;

  const [open, setOpen] = useState(true);

  // Get current array value
  const items = useMemo(() => {
    const currentArray = getDeep(values, node.path);
    if (Array.isArray(currentArray)) return currentArray as Record<string, unknown>[];
    return [] as Record<string, unknown>[];
  }, [values, node.path]);

  // Auto-init one empty item so handles exist in DOM
  useEffect(() => {
    if (items.length === 0) {
      onChange(node.path, [{}]);
    }
  }, [items.length, onChange, node.path]);

  // Proxy handle IDs for collapsed state
  const proxyHandleIds = useMemo(() => {
    if (open || !children) return [];
    return collectChildHandleIds(children, items.length, node.path);
  }, [open, children, items.length, node.path]);

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
      {/* Toggle header — relative so proxy handles position against it */}
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
          <span className="ml-auto text-[9px] text-gray-600">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
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
                      renderImagePort={renderImagePort}
                      renderTextPort={renderTextPort}
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
