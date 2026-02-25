'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type FieldLabelProps = {
  label: string;
  description?: string;
  required?: boolean;
  /** Use span instead of label (for inline-flex layouts like toggles) */
  as?: 'label' | 'span';
};

export function FieldLabel({
  label,
  description,
  required,
  as = 'label',
}: FieldLabelProps) {
  const Tag = as;
  const labelEl = (
    <Tag
      className={`${as === 'label' ? 'mb-0.5 block' : ''} text-[10px] font-medium uppercase tracking-wider text-gray-500`}
    >
      {label}
      {required && <span className="ml-0.5 text-amber-500">*</span>}
    </Tag>
  );

  if (!description) return labelEl;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
