'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImageLightboxProps = {
  images: Array<{ url: string; width: number; height: number }>;
  initialIndex: number;
  open: boolean;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// ImageLightbox
// ---------------------------------------------------------------------------

export function ImageLightbox({
  images,
  initialIndex,
  open,
  onClose,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Reset index when opening with a new initialIndex
  useEffect(() => {
    if (open) setCurrentIndex(initialIndex);
  }, [open, initialIndex]);

  const navigatePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev <= 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const navigateNext = useCallback(() => {
    setCurrentIndex((prev) =>
      prev >= images.length - 1 ? 0 : prev + 1,
    );
  }, [images.length]);

  // Keyboard navigation (ArrowLeft / ArrowRight)
  useEffect(() => {
    if (!open || images.length <= 1) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        navigatePrev();
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation();
        navigateNext();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, images.length, navigatePrev, navigateNext]);

  // Ref wrapping all visible content so we can detect clicks outside it
  const innerRef = useRef<HTMLDivElement>(null);

  // Click-outside-to-close: if click target is NOT inside the inner wrapper, close
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        innerRef.current &&
        !innerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    },
    [onClose],
  );

  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/[0.88] backdrop-blur-[10px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />

        {/* Content */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-[70] flex items-center justify-center outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200"
          onClick={handleContentClick}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Image preview
          </DialogPrimitive.Title>

          {/* Inner wrapper -- clicks outside this ref trigger close */}
          <div ref={innerRef} className="contents">
            {/* Close button */}
            <DialogPrimitive.Close className="fixed top-4 right-4 z-[80] flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white opacity-70 transition-all duration-150 hover:opacity-100 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/30">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>

            {/* Arrow navigation (multi-image only) */}
            {images.length > 1 && (
              <>
                <button
                  onClick={navigatePrev}
                  className="fixed left-4 top-1/2 z-[80] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#1a1a1a] text-white opacity-70 transition-all duration-150 hover:opacity-100 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={navigateNext}
                  className="fixed right-4 top-1/2 z-[80] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#1a1a1a] text-white opacity-70 transition-all duration-150 hover:opacity-100 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            {/* Image */}
            <img
              src={currentImage.url}
              alt={`Image ${currentIndex + 1} of ${images.length}`}
              className="max-h-[calc(100vh-120px)] max-w-[calc(100vw-120px)] object-contain"
            />

            {/* Image counter (multi-image only) */}
            {images.length > 1 && (
              <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[#1a1a1a] px-3 py-1 text-xs font-medium text-white/80">
                {currentIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
