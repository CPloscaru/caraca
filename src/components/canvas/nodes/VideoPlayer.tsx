'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Download, AlertTriangle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useExecutionStore } from '@/stores/execution-store';

// ---------------------------------------------------------------------------
// ElapsedTimer
// ---------------------------------------------------------------------------

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <span className="text-xs text-gray-400">
      Generating... {mm}:{ss}
    </span>
  );
}

// ---------------------------------------------------------------------------
// QueueProgressLogs
// ---------------------------------------------------------------------------

function QueueProgressLogs({
  logs,
}: {
  logs: Array<{ message: string; timestamp: string }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const visible = logs.slice(-3);

  return (
    <div
      ref={scrollRef}
      className="mt-1 max-h-[60px] overflow-y-auto"
    >
      {visible.map((log, i) => (
        <div key={i} className="truncate text-xs text-gray-500">
          {log.message}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GenerationProgress
// ---------------------------------------------------------------------------

export function GenerationProgress({ nodeId }: { nodeId: string }) {
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);

  if (!execState) return null;

  const { status, generationStartedAt, queuePosition, queueLogs } = execState;

  if (status === 'pending') {
    return (
      <div
        className="shimmer-loading w-full overflow-hidden rounded-md"
        style={{ aspectRatio: '16/9', minHeight: 80 }}
      />
    );
  }

  if (status === 'running') {
    return (
      <div className="space-y-1 py-2">
        {generationStartedAt && <ElapsedTimer startedAt={generationStartedAt} />}
        <div className="text-xs italic text-gray-500">
          Video generation usually takes 30-60s
        </div>
        {queuePosition !== undefined && queuePosition > 0 && (
          <div className="text-xs text-gray-500">
            Queue position: {queuePosition}
          </div>
        )}
        {queueLogs && queueLogs.length > 0 && (
          <QueueProgressLogs logs={queueLogs} />
        )}
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// VideoThumbnail
// ---------------------------------------------------------------------------

function VideoThumbnail({
  videoUrl,
  onExpand,
}: {
  videoUrl: string;
  onExpand: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.currentTime > 2) {
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div className="group/thumb relative cursor-pointer" onClick={onExpand}>
      <video
        ref={videoRef}
        src={videoUrl}
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
  );
}

// ---------------------------------------------------------------------------
// VideoLightbox
// ---------------------------------------------------------------------------

export function VideoLightbox({
  videoUrl,
  open,
  onClose,
  videos,
  currentIndex,
  onNavigate,
}: {
  videoUrl: string;
  open: boolean;
  onClose: () => void;
  videos?: Array<{ videoUrl: string; cdnUrl: string }>;
  currentIndex?: number;
  onNavigate?: (index: number) => void;
}) {
  const isBatch = videos && videos.length > 1 && currentIndex != null && onNavigate;
  const displayUrl = isBatch ? videos[currentIndex].videoUrl : videoUrl;
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-play when navigating in batch mode
  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [open, displayUrl]);

  // Keyboard navigation for batch mode
  useEffect(() => {
    if (!open || !isBatch) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        onNavigate(currentIndex <= 0 ? videos.length - 1 : currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation();
        onNavigate(currentIndex >= videos.length - 1 ? 0 : currentIndex + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, isBatch, videos, currentIndex, onNavigate]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] max-w-[90vw] border-white/10 bg-[#0a0a0a] p-0 sm:max-w-[90vw]"
        aria-describedby={undefined}
      >
        <DialogPrimitive.Close className="absolute top-4 right-4 z-[80] flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white opacity-70 transition-all duration-150 hover:opacity-100 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/30">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        <DialogTitle className="sr-only">Video preview</DialogTitle>
        <div className="flex flex-col items-center gap-3 p-4">
          {/* Batch navigation arrows */}
          {isBatch && (
            <>
              <button
                onClick={() => onNavigate(currentIndex <= 0 ? videos.length - 1 : currentIndex - 1)}
                className="absolute left-4 top-1/2 z-[80] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#1a1a1a] text-white opacity-70 transition-all duration-150 hover:opacity-100 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => onNavigate(currentIndex >= videos.length - 1 ? 0 : currentIndex + 1)}
                className="absolute right-14 top-1/2 z-[80] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#1a1a1a] text-white opacity-70 transition-all duration-150 hover:opacity-100 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <video
            ref={videoRef}
            src={displayUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[75vh] w-full rounded-md"
          />
          {/* Counter for batch mode */}
          {isBatch && (
            <div className="text-xs font-medium text-white/80">
              {currentIndex + 1} / {videos.length}
            </div>
          )}
          <a
            href={displayUrl}
            download
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/20"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// VideoResult (main export for node usage)
// ---------------------------------------------------------------------------

export function VideoResult({
  videoUrl,
}: {
  videoUrl: string | null;
  cdnUrl?: string | null;
  nodeId?: string;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!videoUrl) return null;

  // Determine which URL to display
  const displayUrl = videoUrl;
  const isCdnOnly = !videoUrl.startsWith('/api/');

  return (
    <div className="space-y-2">
      <VideoThumbnail
        videoUrl={displayUrl}
        onExpand={() => setLightboxOpen(true)}
      />

      {/* CDN expiry warning */}
      {isCdnOnly && (
        <div className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] text-amber-400">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          CDN URL -- expires in 7 days
        </div>
      )}

      {/* Download link */}
      <a
        href={displayUrl}
        download
        className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-300"
      >
        <Download className="h-3 w-3" />
        Download
      </a>

      <VideoLightbox
        videoUrl={displayUrl}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
