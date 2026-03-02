'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PreviewFullscreenModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Toolbar rendered below the preview area */
  toolbar: ReactNode;
  /** Children = the PreviewCanvas (portaled into modal when open) */
  children: ReactNode;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewFullscreenModal({
  open,
  onOpenChange,
  toolbar,
  children,
}: PreviewFullscreenModalProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (innerRef.current && !innerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/[0.92] backdrop-blur-[10px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200"
          onClick={handleContentClick}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            WebGL Preview
          </DialogPrimitive.Title>

          <div ref={innerRef} className="flex flex-col" style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
            {/* Close button */}
            <DialogPrimitive.Close className="fixed top-4 right-4 z-[80] flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white opacity-70 transition-all duration-150 hover:opacity-100 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/30">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>

            {/* Preview canvas (reparented from node) */}
            <div style={{ flex: 1, overflow: 'hidden', borderRadius: '8px 8px 0 0' }}>
              {children}
            </div>

            {/* Toolbar at bottom */}
            <div style={{ borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {toolbar}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
