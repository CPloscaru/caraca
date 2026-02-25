'use client';

import type { SchemaNode } from '@/lib/fal/schema-tree';
import { SchemaSlider } from './SchemaSlider';
import { SchemaEnum } from './SchemaEnum';
import { SchemaToggle } from './SchemaToggle';
import { SchemaSeed } from './SchemaSeed';
import { SchemaText } from './SchemaText';
import { FieldLabel } from './FieldLabel';
import { SchemaGroup } from './SchemaGroup';
import { RepeatableBlock } from './RepeatableBlock';

type SchemaNodeRendererProps = {
  node: SchemaNode;
  values: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
};

function formatLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Recursive renderer for SchemaNode tree nodes.
 * Dispatches to the appropriate widget based on node kind.
 */
export function SchemaNodeRenderer({
  node,
  values,
  onChange,
}: SchemaNodeRendererProps) {
  const label = formatLabel(node.name);
  const value = values[node.path] ?? node.default;

  // Object → collapsible group
  if (node.kind === 'object' && node.children) {
    return <SchemaGroup node={node} values={values} onChange={onChange} />;
  }

  // Array of objects → repeatable block
  if (node.kind === 'array' && node.itemSchema?.kind === 'object' && node.itemSchema.children) {
    return <RepeatableBlock node={node} values={values} onChange={onChange} />;
  }

  // Seed field
  if (node.name === 'seed') {
    return (
      <SchemaSeed
        label={label}
        value={value as number | null | undefined}
        onChange={(v) => onChange(node.path, v)}
        description={node.description}
        required={node.required}
      />
    );
  }

  // Enum
  if (node.kind === 'enum' && node.enum && node.enum.length > 0) {
    return (
      <SchemaEnum
        label={label}
        value={value as string | undefined}
        onChange={(v) => onChange(node.path, v)}
        options={node.enum.map(String)}
        description={node.description}
        required={node.required}
      />
    );
  }

  // Boolean
  if (node.kind === 'boolean') {
    return (
      <SchemaToggle
        label={label}
        checked={Boolean(value ?? false)}
        onChange={(v) => onChange(node.path, v)}
        description={node.description}
        required={node.required}
      />
    );
  }

  // Number/integer with range → slider
  if (
    (node.kind === 'number' || node.kind === 'integer') &&
    node.minimum != null &&
    node.maximum != null
  ) {
    return (
      <SchemaSlider
        label={label}
        value={value as number | undefined}
        onChange={(v) => onChange(node.path, v)}
        min={node.minimum}
        max={node.maximum}
        step={node.kind === 'integer' ? 1 : undefined}
        description={node.description}
        defaultValue={node.default as number | undefined}
        required={node.required}
      />
    );
  }

  // Number/integer without range
  if (node.kind === 'number' || node.kind === 'integer') {
    return (
      <div className="mb-1.5">
        <FieldLabel label={label} description={node.description} required={node.required} />
        <input
          type="number"
          className="nodrag w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-white/20"
          value={value != null ? String(value) : ''}
          placeholder={node.default != null ? String(node.default) : ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(node.path, v === '' ? undefined : Number(v));
          }}
        />
      </div>
    );
  }

  // String
  if (node.kind === 'string') {
    return (
      <SchemaText
        label={label}
        value={value as string | undefined}
        onChange={(v) => onChange(node.path, v || undefined)}
        placeholder={node.description}
        description={node.description}
        required={node.required}
      />
    );
  }

  // Fallback: skip unknown types
  return null;
}
