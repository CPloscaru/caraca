// ---------------------------------------------------------------------------
// Mouse event bus -- pub/sub for preview mouse/touch events (SSR-safe)
// ---------------------------------------------------------------------------

export type MouseEventData = {
  x: number; // normalized 0-1 relative to preview
  y: number; // normalized 0-1
  pressed: boolean;
  scrollDelta: number;
  touches: Array<{ x: number; y: number }>;
};

type Listener = (data: MouseEventData) => void;
const listeners = new Map<string, Listener>();

export function emitMouseEvent(data: MouseEventData): void {
  for (const cb of listeners.values()) cb(data);
}

export function onMouseEvent(id: string, cb: Listener): void {
  listeners.set(id, cb);
}

export function offMouseEvent(id: string): void {
  listeners.delete(id);
}
