'use client';

import { FieldLabel } from './FieldLabel';

type SchemaTextProps = {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  description?: string;
  required?: boolean;
};

export function SchemaText({
  label,
  value,
  onChange,
  placeholder,
  description,
  required,
}: SchemaTextProps) {
  return (
    <div className="mb-1.5">
      <FieldLabel label={label} description={description} required={required} />
      <textarea
        className="nodrag nowheel w-full resize-none rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-white/20"
        placeholder={(placeholder ?? '').replace(/\s+/g, ' ').trim()}
        rows={2}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
