'use client';

import { useCallback, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ColorStop } from '@/types/canvas';

type ColorStopEditorProps = {
  colorStops: ColorStop[];
  onChange: (stops: ColorStop[]) => void;
};

const MIN_STOPS = 2;
const MAX_STOPS = 8;

export function ColorStopEditor({ colorStops, onChange }: ColorStopEditorProps) {
  const colorInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const handleColorChange = useCallback(
    (index: number, color: string) => {
      const next = colorStops.map((s, i) => (i === index ? { ...s, color } : s));
      onChange(next);
    },
    [colorStops, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      if (colorStops.length <= MIN_STOPS) return;
      const next = colorStops.filter((_, i) => i !== index);
      onChange(next);
    },
    [colorStops, onChange],
  );

  const handleAdd = useCallback(() => {
    if (colorStops.length >= MAX_STOPS) return;
    const lastPos = colorStops[colorStops.length - 1]?.position ?? 0;
    const newPos = Math.min(lastPos + 0.25, 1);
    onChange([...colorStops, { color: '#ffffff', position: newPos }]);
  }, [colorStops, onChange]);

  return (
    <div className="mb-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-gray-400">Color Stops</span>
        {colorStops.length < MAX_STOPS && (
          <button
            className="nodrag flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-gray-500 hover:bg-white/5 hover:text-gray-300"
            onClick={handleAdd}
          >
            <Plus size={10} />
            Add
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {colorStops.map((stop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {/* Color swatch — clicks hidden native input */}
            <button
              className="nodrag h-5 w-5 shrink-0 rounded border border-white/10"
              style={{ backgroundColor: stop.color }}
              onClick={() => colorInputRefs.current.get(i)?.click()}
            />
            <input
              ref={(el) => {
                if (el) colorInputRefs.current.set(i, el);
                else colorInputRefs.current.delete(i);
              }}
              type="color"
              className="sr-only"
              value={stop.color}
              onChange={(e) => handleColorChange(i, e.target.value)}
            />

            {/* Hex display */}
            <span className="flex-1 text-[10px] tabular-nums text-gray-400">
              {stop.color}
            </span>

            {/* Position display */}
            <span className="w-6 text-right text-[9px] tabular-nums text-gray-500">
              {Math.round(stop.position * 100)}%
            </span>

            {/* Remove button */}
            <button
              className="nodrag shrink-0 rounded p-0.5 text-gray-600 hover:bg-white/5 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
              onClick={() => handleRemove(i)}
              disabled={colorStops.length <= MIN_STOPS}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
