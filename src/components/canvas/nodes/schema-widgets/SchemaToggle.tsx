'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type SchemaToggleProps = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
};

export function SchemaToggle({
  label,
  checked,
  onChange,
  description,
}: SchemaToggleProps) {
  const labelEl = (
    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
      {label}
    </span>
  );

  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
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
