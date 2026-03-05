import type { RenderCallback } from './types';

const callbacks = new Map<string, RenderCallback>();
let rafId: number | null = null;
let lastTime = 0;

function loop(time: number): void {
  const delta = lastTime === 0 ? 0 : time - lastTime;
  lastTime = time;

  for (const cb of callbacks.values()) {
    cb(time, delta);
  }

  rafId = requestAnimationFrame(loop);
}

/** Register a render callback. Starts the RAF loop on first registration. */
export function registerCallback(id: string, cb: RenderCallback): void {
  callbacks.set(id, cb);
  if (rafId === null) {
    lastTime = 0;
    rafId = requestAnimationFrame(loop);
  }
}

/** Unregister a render callback. Stops the RAF loop when no callbacks remain. */
export function unregisterCallback(id: string): void {
  callbacks.delete(id);
  if (callbacks.size === 0 && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    lastTime = 0;
  }
}
