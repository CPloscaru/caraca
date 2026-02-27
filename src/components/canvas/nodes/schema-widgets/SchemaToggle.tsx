'use client';

import { FieldLabel } from './FieldLabel';

type SchemaToggleProps = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  required?: boolean;
};

export function SchemaToggle({
  label,
  checked,
  onChange,
  description,
  required,
}: SchemaToggleProps) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <FieldLabel label={label} description={description} required={required} as="span" />
      <button
        className={`nodrag relative h-4 w-7 rounded-full transition-colors ${
          checked ? 'bg-purple-500' : 'bg-white/10'
        }`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-3' : ''
          }`}
        />
      </button>
    </div>
  );
}
