'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type SchemaTextProps = {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  description?: string;
};

export function SchemaText({
  label,
  value,
  onChange,
  placeholder,
  description,
}: SchemaTextProps) {
  const labelEl = (
    <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
      {label}
    </label>
  );

  return (
    <div className="mb-1.5">
      {description ? (
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
      )}
      <textarea
        className="nodrag nowheel w-full resize-none rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-white/20"
        placeholder={placeholder ?? ''}
        rows={2}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
