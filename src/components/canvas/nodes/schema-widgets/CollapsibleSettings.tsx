'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type CollapsibleSettingsProps = {
  children: React.ReactNode;
  label?: string;
  defaultOpen?: boolean;
};

export function CollapsibleSettings({
  children,
  label = 'More Settings',
  defaultOpen = false,
}: CollapsibleSettingsProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-white/5">
      <button
        className="nodrag flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-300"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        {open ? 'Less' : label}
      </button>
      {open && (
        <div className="nodrag nowheel px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
