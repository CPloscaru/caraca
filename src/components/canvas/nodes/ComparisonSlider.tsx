'use client';

import { useCallback, useRef, useState } from 'react';

type ComparisonSliderProps = {
  beforeUrl: string;
  afterUrl: string;
};

export function ComparisonSlider({ beforeUrl, afterUrl }: ComparisonSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updatePosition(e.clientX);
    },
    [updatePosition],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (!dragging.current) return;
      updatePosition(e.clientX);
    },
    [updatePosition],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    dragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="nodrag nowheel relative w-full cursor-col-resize select-none overflow-hidden rounded-md"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Before image (full, underneath) */}
      <img
        src={beforeUrl}
        alt=""
        className="block w-full"
        draggable={false}
      />

      {/* After image (clipped from right) */}
      <img
        src={afterUrl}
        alt=""
        className="absolute inset-0 block w-full h-full object-cover"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        draggable={false}
      />

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        {/* Circle drag handle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-black/50">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 1L1 5L3 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 1L9 5L7 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
