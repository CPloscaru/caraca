'use client';

import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Keyboard shortcut hook for undo (Cmd+Z) and redo (Cmd+Shift+Z).
 * Uses zundo temporal middleware on the canvas store.
 *
 * Call once from CanvasPage — attaches a window keydown listener.
 */
export function useUndoRedo() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Cmd/Ctrl+Z combos
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;

      e.preventDefault();

      const temporal = useCanvasStore.temporal.getState();

      if (e.shiftKey) {
        // Redo: Cmd+Shift+Z
        temporal.redo();
      } else {
        // Undo: Cmd+Z
        temporal.undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
