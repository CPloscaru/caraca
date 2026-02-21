'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/stores/canvas-store';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

const DEBOUNCE_MS = 2000;

export function useAutoSave(projectId: string) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const rfInstance = useReactFlow();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveCountRef = useRef(0);
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
      const flowObject = rfInstance.toObject();
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_json: flowObject }),
        signal: controller.signal,
      });
      if (!isMountedRef.current) return;
      if (res.ok) {
        saveCountRef.current += 1;
        setSaveStatus('saved');
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
      // sendBeacon only sends POST, so use the POST endpoint
      const flowObject = rfInstance.toObject();
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
      // Fire beacon save on navigation away
      try {
        const flowObject = rfInstance.toObject();
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
    };
  }, [projectId, rfInstance]);

  // --- Mark initial restore as complete (called by CanvasPage) ---------------
  const markRestored = useCallback(() => {
    restoredRef.current = true;
  }, []);

  return { saveStatus, saveNow, saveCountRef, markRestored };
}
