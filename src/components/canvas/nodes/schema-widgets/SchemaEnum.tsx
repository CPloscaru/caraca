'use client';

import { useCallback, useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type SchemaEnumProps = {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: string[];
  description?: string;
};

const PILL_THRESHOLD = 8;

export function SchemaEnum({
  label,
  value,
  onChange,
  options,
  description,
}: SchemaEnumProps) {
  // Detect grouped options (contain '/')
  const groups = useMemo(() => {
    const hasSlash = options.some((o) => o.includes('/'));
    if (!hasSlash || options.length <= PILL_THRESHOLD) return null;

    const map = new Map<string, string[]>();
    for (const opt of options) {
      const slashIdx = opt.indexOf('/');
      const group = slashIdx > 0 ? opt.slice(0, slashIdx) : '';
      const existing = map.get(group) ?? [];
      existing.push(opt);
      map.set(group, existing);
    }
    return map;
  }, [options]);

  const usePills = options.length <= PILL_THRESHOLD && !groups;

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const labelEl = (
    <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
      {label}
    </label>
  );

  const wrappedLabel = description ? (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    labelEl
  );

  if (usePills) {
    return (
      <div className="mb-1.5">
        {wrappedLabel}
        <div className="flex flex-wrap gap-0.5">
          {options.map((opt) => (
            <button
              key={opt}
              className={`nodrag rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                value === opt
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
              }`}
              onClick={() => onChange(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Select dropdown (with optional optgroups)
  return (
    <div className="mb-1.5">
      {wrappedLabel}
      <select
        className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
        value={value ?? ''}
        onChange={handleSelect}
      >
        <option value="">Select...</option>
        {groups
          ? Array.from(groups.entries()).map(([groupName, opts]) =>
              groupName ? (
                <optgroup key={groupName} label={groupName}>
                  {opts.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </optgroup>
              ) : (
                opts.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))
              ),
            )
          : options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
      </select>
    </div>
  );
}
