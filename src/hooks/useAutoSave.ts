'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/stores/canvas-store';
import { captureCanvasThumbnail, uploadThumbnail } from '@/hooks/useCanvasThumbnail';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

const DEBOUNCE_MS = 2000;

export function useAutoSave(projectId: string) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const rfInstance = useReactFlow();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  // Track whether initial restore has happened — skip auto-save for store
  // changes that originate from the restore itself.
  const restoredRef = useRef(false);

  // --- Core save function ---------------------------------------------------
  const doSave = useCallback(async () => {
    if (!isMountedRef.current) return;

    // Abort any in-flight request to avoid stale overwrites
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSaveStatus('saving');

    try {
      // Build save object from Zustand store (source of truth for nodes/edges)
      // + React Flow viewport. rfInstance.toObject() can return stale edges
      // when edges are managed externally via controlled props.
      const { nodes, edges } = useCanvasStore.getState();
      const { viewport } = rfInstance.toObject();
      const flowObject = { nodes, edges, viewport };
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_json: flowObject }),
        signal: controller.signal,
      });
      if (!isMountedRef.current) return;
      if (res.ok) {
        setSaveStatus('saved');

        // Capture thumbnail on every save — fire-and-forget
        const nodes = useCanvasStore.getState().nodes;
        captureCanvasThumbnail(nodes, rfInstance.getNodesBounds).then((blob) => {
          if (blob) uploadThumbnail(projectId, blob);
        });
      } else {
        setSaveStatus('unsaved');
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return; // superseded
      if (isMountedRef.current) setSaveStatus('unsaved');
    }
  }, [projectId, rfInstance]);

  // --- Schedule a debounced save --------------------------------------------
  const scheduleSave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSaveStatus('unsaved');
    timeoutRef.current = setTimeout(() => {
      doSave();
    }, DEBOUNCE_MS);
  }, [doSave]);

  // --- Immediate save (Cmd+S) -----------------------------------------------
  const saveNow = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    doSave();
  }, [doSave]);

  // --- Subscribe to canvas store changes ------------------------------------
  useEffect(() => {
    // Subscribe to zustand store changes (outside React render cycle)
    const unsub = useCanvasStore.subscribe(
      (state, prev) => {
        // Skip changes caused by the initial restore
        if (!restoredRef.current) return;

        if (state.nodes !== prev.nodes || state.edges !== prev.edges) {
          scheduleSave();
        }
      },
    );
    return () => unsub();
  }, [scheduleSave]);

  // --- Cmd+S handler --------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveNow]);

  // --- Save on beforeunload via sendBeacon ----------------------------------
  useEffect(() => {
    const handler = () => {
      // Skip if restore hasn't completed yet to avoid overwriting with empty state
      if (!restoredRef.current) return;
      // sendBeacon only sends POST, so use the POST endpoint
      const { nodes, edges } = useCanvasStore.getState();
      const { viewport } = rfInstance.toObject();
      const flowObject = { nodes, edges, viewport };
      navigator.sendBeacon(
        `/api/projects/${projectId}`,
        new Blob(
          [JSON.stringify({ workflow_json: flowObject })],
          { type: 'application/json' },
        ),
      );
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [projectId, rfInstance]);

  // --- Save on unmount (Next.js navigation) ---------------------------------
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear pending timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Abort in-flight request
      abortRef.current?.abort();
      // Only save on unmount if restore has completed — otherwise we'd
      // overwrite the DB with empty state (React Strict Mode double-mount).
      if (restoredRef.current) {
        // Fire beacon save on navigation away
        try {
          const { nodes, edges } = useCanvasStore.getState();
          const { viewport } = rfInstance.toObject();
          const flowObject = { nodes, edges, viewport };
          navigator.sendBeacon(
            `/api/projects/${projectId}`,
            new Blob(
              [JSON.stringify({ workflow_json: flowObject })],
              { type: 'application/json' },
            ),
          );
        } catch {
          // best-effort
        }
        // Capture and upload thumbnail on navigation away (fire-and-forget)
        const nodes = useCanvasStore.getState().nodes;
        captureCanvasThumbnail(nodes, rfInstance.getNodesBounds).then((blob) => {
          if (blob) uploadThumbnail(projectId, blob);
        });
      }
      // Prevent any further saves (e.g. from store clearing below)
      restoredRef.current = false;
      // Clear canvas store to avoid stale state when opening another project.
      // This MUST happen after the beacon save and after restoredRef is reset
      // so the subscriber doesn't trigger a save with empty data.
      const store = useCanvasStore.getState();
      store.setNodes([]);
      store.setEdges([]);
    };
  }, [projectId, rfInstance]);

  // --- Mark initial restore as complete (called by CanvasPage) ---------------
  const markRestored = useCallback(() => {
    restoredRef.current = true;
  }, []);

  return { saveStatus, saveNow, markRestored };
}
