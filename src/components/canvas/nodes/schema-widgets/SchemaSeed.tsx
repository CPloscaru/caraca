'use client';

import { useCallback } from 'react';
import { Dices } from 'lucide-react';
import { FieldLabel } from './FieldLabel';

type SchemaSeedProps = {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  description?: string;
  required?: boolean;
};

export function SchemaSeed({ label, value, onChange, description, required }: SchemaSeedProps) {
  const randomize = useCallback(() => {
    onChange(Math.floor(Math.random() * 2147483647));
  }, [onChange]);

  return (
    <div className="mb-1.5">
      <FieldLabel label={label} description={description} required={required} />
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="nodrag w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-white/20"
          placeholder="Random"
          value={value ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? null : Number(v));
          }}
        />
        <button
          className="nodrag rounded bg-white/5 p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
          onClick={randomize}
          title="Randomize seed"
        >
          <Dices className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
