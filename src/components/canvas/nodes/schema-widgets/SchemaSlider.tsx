'use client';

import { useCallback } from 'react';
import { FieldLabel } from './FieldLabel';

type SchemaSliderProps = {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  description?: string;
  defaultValue?: number;
  required?: boolean;
};

export function SchemaSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  description,
  defaultValue,
  required,
}: SchemaSliderProps) {
  const displayValue = value ?? defaultValue ?? min;

  // Infer step from range if not provided
  const effectiveStep =
    step ?? (max - min <= 1 ? 0.01 : max - min <= 10 ? 0.1 : 1);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <div className="mb-1.5">
      <FieldLabel label={label} description={description} required={required} />
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-purple-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400"
          min={min}
          max={max}
          step={effectiveStep}
          value={displayValue}
          onChange={handleChange}
        />
        <span className="w-10 text-right text-[10px] tabular-nums text-gray-400">
          {Number.isInteger(displayValue) ? displayValue : displayValue.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
