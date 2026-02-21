'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Grid2X2,
  GalleryHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImageItem = {
  url: string;
  width: number;
  height: number;
};

type ImageResultGridProps = {
  images: ImageItem[];
  selectedImageIndex?: number;
  onSelectImage?: (index: number) => void;
};

// ---------------------------------------------------------------------------
// ImageResultGrid
// ---------------------------------------------------------------------------

export function ImageResultGrid({
  images,
  selectedImageIndex = 0,
  onSelectImage,
}: ImageResultGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const navigateLightbox = useCallback(
    (dir: -1 | 1) => {
      setLightboxIndex((prev) => {
        if (prev === null) return null;
        const next = prev + dir;
        if (next < 0) return images.length - 1;
        if (next >= images.length) return 0;
        return next;
      });
    },
    [images.length],
  );

  const handleImageClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (onSelectImage) {
        // Single click selects for downstream flow
        onSelectImage(index);
      }
      // Double click opens lightbox
      if (e.detail === 2) {
        openLightbox(index);
      }
    },
    [onSelectImage, openLightbox],
  );

  if (images.length === 0) return null;

  return (
    <div className="nodrag nowheel">
      {/* View mode toggle (only show if multiple images) */}
      {images.length > 1 && (
        <div className="mb-1.5 flex justify-end">
          <div className="flex rounded-md border border-white/10 bg-white/5">
            <button
              className={`rounded-l-md p-1 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white/10 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => setViewMode('grid')}
            >
              <Grid2X2 className="h-3 w-3" />
            </button>
            <button
              className={`rounded-r-md p-1 transition-colors ${
                viewMode === 'carousel'
                  ? 'bg-white/10 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => setViewMode('carousel')}
            >
              <GalleryHorizontal className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns:
              images.length === 1 ? '1fr' : 'repeat(2, 1fr)',
          }}
        >
          {images.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              className={`overflow-hidden rounded-md transition-all focus:outline-none ${
                i === selectedImageIndex
                  ? 'ring-2 ring-[#2a8af6]'
                  : 'ring-1 ring-transparent hover:ring-white/20'
              }`}
              onClick={(e) => handleImageClick(i, e)}
            >
              <img
                src={img.url}
                alt={`Generated image ${i + 1}`}
                className="h-full w-full object-cover"
                style={{ aspectRatio: `${img.width}/${img.height}` }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Carousel view */}
      {viewMode === 'carousel' && (
        <div className="relative">
          <button
            className={`overflow-hidden rounded-md transition-all focus:outline-none ${
              carouselIndex === selectedImageIndex
                ? 'ring-2 ring-[#2a8af6]'
                : ''
            }`}
            onClick={(e) => handleImageClick(carouselIndex, e)}
          >
            <img
              src={images[carouselIndex].url}
              alt={`Generated image ${carouselIndex + 1}`}
              className="w-full rounded-md object-cover"
              style={{
                aspectRatio: `${images[carouselIndex].width}/${images[carouselIndex].height}`,
              }}
            />
          </button>
          {images.length > 1 && (
            <>
              <button
                className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                onClick={() =>
                  setCarouselIndex((p) =>
                    p <= 0 ? images.length - 1 : p - 1,
                  )
                }
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                onClick={() =>
                  setCarouselIndex((p) =>
                    p >= images.length - 1 ? 0 : p + 1,
                  )
                }
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <div className="mt-1 text-center text-[10px] text-gray-500">
                {carouselIndex + 1} / {images.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Lightbox modal */}
      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeLightbox();
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] max-w-[90vw] items-center justify-center border-white/10 bg-[#0a0a0a] p-0"
          showCloseButton
        >
          {lightboxIndex !== null && (
            <div className="relative flex items-center justify-center">
              <img
                src={images[lightboxIndex].url}
                alt={`Generated image ${lightboxIndex + 1}`}
                className="max-h-[85vh] max-w-[85vw] object-contain"
              />
              {images.length > 1 && (
                <>
                  <button
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
                    onClick={() => navigateLightbox(-1)}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
                    onClick={() => navigateLightbox(1)}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
