'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, AlertTriangle } from 'lucide-react';
import { VideoLightbox } from './VideoPlayer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VideoResultCarouselProps = {
  videos: Array<{ videoUrl: string; cdnUrl: string }>;
  errors?: Array<{ index: number; error: string }>;
};

// ---------------------------------------------------------------------------
// VideoResultCarousel
// ---------------------------------------------------------------------------

export function VideoResultCarousel({ videos, errors }: VideoResultCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Clamp index if videos array shrinks
  useEffect(() => {
    if (currentIndex >= videos.length) {
      setCurrentIndex(Math.max(0, videos.length - 1));
    }
  }, [videos.length, currentIndex]);

  // Auto-play when navigating
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [currentIndex]);

  const navigatePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev <= 0 ? videos.length - 1 : prev - 1));
  }, [videos.length]);

  const navigateNext = useCallback(() => {
    setCurrentIndex((prev) => (prev >= videos.length - 1 ? 0 : prev + 1));
  }, [videos.length]);

  // Loop thumbnail at 2s
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && videoRef.current.currentTime > 2) {
      videoRef.current.currentTime = 0;
    }
  }, []);

  // Check if current index has an error
  const currentError = errors?.find((e) => e.index === currentIndex);
  const currentVideo = videos[currentIndex];

  if (videos.length === 0) return null;

  return (
    <div className="nodrag nowheel">
      <div className="relative">
        {currentError ? (
          /* Error placeholder */
          <div
            className="flex flex-col items-center justify-center rounded-md border border-red-500/30 bg-red-900/20 text-center"
            style={{ aspectRatio: '16/9', minHeight: 80 }}
          >
            <AlertTriangle className="mb-1 h-5 w-5 text-red-400" />
            <span className="px-2 text-[10px] text-red-400">{currentError.error}</span>
          </div>
        ) : currentVideo ? (
          /* Video thumbnail */
          <div
            className="group/thumb relative cursor-pointer"
            onClick={() => setLightboxOpen(true)}
          >
            <video
              ref={videoRef}
              src={currentVideo.videoUrl}
              loop
              muted
              autoPlay
              playsInline
              onTimeUpdate={handleTimeUpdate}
              className="w-full rounded-md"
              style={{ maxHeight: 180 }}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/thumb:opacity-100">
              <div className="rounded-full bg-black/60 p-2">
                <Maximize2 className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        ) : (
          /* Loading skeleton */
          <div
            className="shimmer-loading w-full overflow-hidden rounded-md"
            style={{ aspectRatio: '16/9', minHeight: 80 }}
          />
        )}

        {/* Prev/Next navigation */}
        {videos.length > 1 && (
          <>
            <button
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              onClick={navigatePrev}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              onClick={navigateNext}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Counter */}
      {videos.length > 1 && (
        <div className="mt-1 text-center text-[10px] text-gray-500">
          {currentIndex + 1} / {videos.length}
        </div>
      )}

      {/* Lightbox */}
      <VideoLightbox
        videoUrl={currentVideo?.videoUrl ?? ''}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        videos={videos}
        currentIndex={currentIndex}
        onNavigate={setCurrentIndex}
      />
    </div>
  );
}
