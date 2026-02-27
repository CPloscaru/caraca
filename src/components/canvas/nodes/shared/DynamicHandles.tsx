'use client';

import { Position, useNodeConnections } from '@xyflow/react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { FieldLabel } from '../schema-widgets';
import type { SchemaNode } from '@/lib/fal/schema-tree';
import type { DynamicImagePort } from '@/lib/fal/schema-introspection';

// ---------------------------------------------------------------------------
// Shared tooltip builder
// ---------------------------------------------------------------------------

export function buildPortTooltip(port: DynamicImagePort, connectionCount: number): string {
  const parts: string[] = [];
  if (port.description) parts.push(port.description);
  parts.push(port.required ? 'Required' : 'Optional');
  if (port.multi) {
    parts.push(port.maxConnections != null ? `Multi (${connectionCount}/${port.maxConnections})` : `Multi (${connectionCount})`);
  } else {
    parts.push('Single image');
  }
  return parts.join('. ') + '.';
}

// ---------------------------------------------------------------------------
// DynamicImageHandle
// ---------------------------------------------------------------------------

export function DynamicImageHandle({
  port,
  handleId,
}: {
  port: DynamicImagePort;
  handleId: string;
}) {
  const connections = useNodeConnections({ handleType: 'target', handleId });
  const connected = connections.length > 0;

  return (
    <div className="relative flex items-center rounded-md border border-white/10 bg-white/5 px-3 py-1.5">
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="image"
        portId={handleId}
        handleId={handleId}
        index={0}
        required={port.required && !connected}
        isConnectable={port.maxConnections ?? undefined}
        style={{ left: 0 }}
      />
      <FieldLabel
        label={connected ? `${port.label} \u2713` : port.label}
        description={buildPortTooltip(port, connections.length)}
        required={port.required && !connected}
        as="span"
      />
      {port.multi && port.maxConnections != null && (
        <span className="ml-auto text-[9px] text-gray-500">
          {connections.length}/{port.maxConnections}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DynamicTextHandle
// ---------------------------------------------------------------------------

export function DynamicTextHandle({
  node,
  handleId,
  value,
  onChange,
}: {
  node: SchemaNode;
  handleId: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const connections = useNodeConnections({ handleType: 'target', handleId });
  const connected = connections.length > 0;
  const label = node.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="relative mb-1.5">
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="text"
        portId={handleId}
        handleId={handleId}
        index={0}
        style={{ left: 0 }}
      />
      <FieldLabel
        label={connected ? `${label} \u2713` : label}
        description={node.description}
        required={node.required && !connected}
      />
      <textarea
        className="nodrag nowheel w-full resize-none rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-white/20"
        placeholder={(node.description ?? label).replace(/\s+/g, ' ').trim()}
        rows={2}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}
