'use client';

import { useCallback, useMemo } from 'react';
import { PanelLeft, Settings, Play, Square, Trash2 } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runAllWorkflow } from '@/lib/executors';

// ---------------------------------------------------------------------------
// Shared button style helper
// ---------------------------------------------------------------------------

const iconBtnBase: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.15s ease, background 0.15s ease',
};

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
  (e.currentTarget as HTMLElement).style.background = 'rgba(174, 83, 186, 0.12)';
}

function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLElement).style.color = '#9ca3af';
  (e.currentTarget as HTMLElement).style.background = 'transparent';
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export function Toolbar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const openSettings = useAppStore((s) => s.openSettings);
  const isRunning = useExecutionStore((s) => s.isRunning);
  const nodeStates = useExecutionStore((s) => s.nodeStates);
  const cancelExecution = useExecutionStore((s) => s.cancelExecution);
  const clearAll = useExecutionStore((s) => s.clearAll);

  const hasResults = useMemo(
    () =>
      Object.values(nodeStates).some(
        (ns) => ns.status === 'done' || ns.status === 'error',
      ),
    [nodeStates],
  );

  const handleRunAll = useCallback(() => {
    runAllWorkflow().catch((err) => {
      console.error('Run All failed:', err);
    });
  }, []);

  const handleClear = useCallback(() => {
    clearAll();
    // Also clear images from all ImageGenerator nodes in canvas store
    const { nodes, updateNodeData } = useCanvasStore.getState();
    for (const node of nodes) {
      const data = node.data as Record<string, unknown>;
      if (data.type === 'imageGenerator') {
        updateNodeData(node.id, { images: [] });
      }
    }
  }, [clearAll]);

  return (
    <div
      style={{
        height: 48,
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        flexShrink: 0,
      }}
    >
      {/* Left: sidebar toggle + app name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={toggleSidebar}
          style={iconBtnBase}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          title="Toggle sidebar"
        >
          <PanelLeft size={20} />
        </button>
        <span
          style={{
            color: '#f3f4f6',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          Caraca
        </span>
      </div>

      {/* Right: execution controls + settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Clear button — visible when any node has results */}
        {hasResults && !isRunning && (
          <button
            onClick={handleClear}
            style={{
              ...iconBtnBase,
              gap: 4,
              fontSize: 12,
              padding: '4px 10px',
            }}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            title="Clear all results"
          >
            <Trash2 size={14} />
            <span>Clear</span>
          </button>
        )}

        {/* Cancel button — visible only when running */}
        {isRunning && (
          <button
            onClick={cancelExecution}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 500,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                'rgba(239, 68, 68, 0.1)';
            }}
            title="Cancel execution"
          >
            <Square size={14} />
            <span>Cancel</span>
          </button>
        )}

        {/* Run All button */}
        <button
          onClick={handleRunAll}
          disabled={isRunning}
          style={{
            background: isRunning
              ? 'rgba(174, 83, 186, 0.15)'
              : 'rgba(174, 83, 186, 0.2)',
            border: '1px solid rgba(174, 83, 186, 0.4)',
            color: isRunning ? '#9ca3af' : '#e9b5f0',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            padding: '4px 12px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            transition: 'background 0.15s ease, color 0.15s ease',
            opacity: isRunning ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isRunning) {
              (e.currentTarget as HTMLElement).style.background =
                'rgba(174, 83, 186, 0.35)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = isRunning
              ? 'rgba(174, 83, 186, 0.15)'
              : 'rgba(174, 83, 186, 0.2)';
          }}
          title="Run all workflow"
        >
          <Play size={14} />
          <span>Run All</span>
        </button>

        {/* Settings */}
        <button
          onClick={openSettings}
          style={iconBtnBase}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
}
