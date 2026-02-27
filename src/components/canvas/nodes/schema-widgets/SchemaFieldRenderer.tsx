'use client';

import type { ModelInputField } from '@/lib/fal/schema-introspection';
import { SchemaSlider } from './SchemaSlider';
import { SchemaEnum } from './SchemaEnum';
import { SchemaToggle } from './SchemaToggle';
import { SchemaSeed } from './SchemaSeed';
import { SchemaText } from './SchemaText';
import { FieldLabel } from './FieldLabel';

type SchemaFieldRendererProps = {
  field: ModelInputField;
  value: unknown;
  onChange: (v: unknown) => void;
};

/** Format a field name into a human-readable label (snake_case → Title Case) */
function formatLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Dispatcher: inspects field type/enum/name and renders the appropriate widget.
 */
export function SchemaFieldRenderer({
  field,
  value,
  onChange,
}: SchemaFieldRendererProps) {
  const label = formatLabel(field.name);

  // Seed field — special handling
  if (field.name === 'seed') {
    return (
      <SchemaSeed
        label={label}
        value={value as number | null | undefined}
        onChange={onChange}
        description={field.description}
        required={field.required}
      />
    );
  }

  // Enum values → pill buttons or dropdown
  if (field.enum && field.enum.length > 0) {
    return (
      <SchemaEnum
        label={label}
        value={value as string | undefined}
        onChange={(v) => onChange(v)}
        options={field.enum.map(String)}
        description={field.description}
        required={field.required}
      />
    );
  }

  // Boolean → toggle
  if (field.type === 'boolean') {
    return (
      <SchemaToggle
        label={label}
        checked={Boolean(value ?? field.default ?? false)}
        onChange={onChange}
        description={field.description}
        required={field.required}
      />
    );
  }

  // Number/integer → slider (when min/max are known)
  if (
    (field.type === 'number' || field.type === 'integer') &&
    field.minimum != null &&
    field.maximum != null
  ) {
    return (
      <SchemaSlider
        label={label}
        value={value as number | undefined}
        onChange={onChange}
        min={field.minimum}
        max={field.maximum}
        step={field.type === 'integer' ? 1 : undefined}
        description={field.description}
        defaultValue={field.default as number | undefined}
        required={field.required}
      />
    );
  }

  // Number/integer without range → small text input
  if (field.type === 'number' || field.type === 'integer') {
    return (
      <div className="mb-1.5">
        <FieldLabel label={label} description={field.description} required={field.required} />
        <input
          type="number"
          className="nodrag w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-white/20"
          value={value != null ? String(value) : ''}
          placeholder={field.default != null ? String(field.default) : ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : Number(v));
          }}
        />
      </div>
    );
  }

  // String → text area
  if (field.type === 'string') {
    return (
      <SchemaText
        label={label}
        value={value as string | undefined}
        onChange={(v) => onChange(v || undefined)}
        placeholder={field.description}
        description={field.description}
        required={field.required}
      />
    );
  }

  // Fallback: skip unknown types
  return null;
}
