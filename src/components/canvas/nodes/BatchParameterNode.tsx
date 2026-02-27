'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { List, X, RotateCcw } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { retryFailedBatchItems } from '@/lib/executors';
import { getPortTypeFromHandleId, type PortType } from '@/lib/port-types';
import { BatchValueEditor } from './BatchValueEditor';
import { getStatusBorderClass, ShimmerPlaceholder } from './node-utils';
import type { BatchParameterData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// BatchParameterNode
// ---------------------------------------------------------------------------

export function BatchParameterNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as BatchParameterData;

  // Execution state
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);
  const batchProgress = useExecutionStore((s) => s.batchProgress[nodeId]);
  const isRunning = execState?.status === 'running' || !!batchProgress;
  const isPending = execState?.status === 'pending';
  const hasError = execState?.status === 'error';

  // Canvas store
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useEdges();

  // Derived data
  const values = nodeData.values ?? [];
  const errorMode = nodeData.errorMode ?? 'skip';
  const appendMode = nodeData.appendMode ?? false;
  const batchResults = nodeData.batchResults ?? null;

  const statusBorder = getStatusBorderClass(execState?.status);

  // Summary toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'warning'>('success');
  const prevBatchProgressRef = useRef<boolean>(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect batch completion: batchProgress goes from truthy to falsy while results exist
  useEffect(() => {
    const wasBatching = prevBatchProgressRef.current;
    const isBatching = !!batchProgress;
    prevBatchProgressRef.current = isBatching;

    if (wasBatching && !isBatching && batchResults && batchResults.length > 0) {
      const done = batchResults.filter((r: { status: string }) => r.status === 'done').length;
      const errors = batchResults.filter((r: { status: string }) => r.status === 'error').length;
      const total = batchResults.length;

      if (errors > 0) {
        setToastMessage(`${done}/${total} generated, ${errors} failed`);
        setToastType('warning');
      } else {
        setToastMessage(`${done}/${total} generated`);
        setToastType('success');
      }

      // Auto-dismiss after 5 seconds
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 5000);
    }
  }, [batchProgress, batchResults]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Dynamic output port type
  // ---------------------------------------------------------------------------
  const outputPortType: PortType = useMemo(() => {
    const outEdge = edges.find((e) => e.source === nodeId);
    if (outEdge?.targetHandle) {
      const targetType = getPortTypeFromHandleId(outEdge.targetHandle);
      if (targetType) return targetType;
    }
    return 'text';
  }, [edges, nodeId]);

  // ---------------------------------------------------------------------------
  // Has failed items (for retry button)
  // ---------------------------------------------------------------------------
  const hasFailedItems = useMemo(() => {
    if (!batchResults || batchResults.length === 0) return false;
    return batchResults.some((r: { status: string }) => r.status === 'error');
  }, [batchResults]);

  // ---------------------------------------------------------------------------
  // Update helpers
  // ---------------------------------------------------------------------------
  const handleValuesChange = useCallback(
    (newValues: string[]) => {
      updateNodeData(nodeId, { values: newValues });
    },
    [nodeId, updateNodeData],
  );

  const handleRetryFailed = useCallback(() => {
    retryFailedBatchItems(nodeId).catch((err) => {
      console.error('Batch retry failed:', err);
    });
  }, [nodeId]);

  return (
    <div
      className={`group relative rounded-lg border-2 bg-[#1a1a1a] shadow-lg transition-all ${statusBorder} ${
        selected
          ? 'ring-2 ring-teal-500 ring-offset-1 ring-offset-transparent'
          : ''
      }`}
      style={{ minWidth: 280, maxWidth: 360 }}
    >
      {/* Output handle - dynamic type */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType={outputPortType}
        portId={`${outputPortType}-source-0`}
        index={0}
        style={{ top: '50%' }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <List className="h-4 w-4 text-teal-400" />
        <span className="text-xs font-semibold text-gray-100">
          Batch Parameter
        </span>
        <span className="ml-auto rounded bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-medium text-teal-400">
          Batch
        </span>
      </div>

      {/* Result area */}
      <div className="px-3 py-2 space-y-2">
        {/* Progress section (during execution) */}
        {batchProgress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-teal-400">
                Running {batchProgress.current}/{batchProgress.total}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">
                  {Math.round(
                    (batchProgress.current / batchProgress.total) * 100,
                  )}
                  %
                </span>
                {/* Cancel button */}
                <button
                  className="nodrag flex h-4 w-4 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white/10 hover:text-red-400"
                  onClick={() => useExecutionStore.getState().cancelExecution()}
                  title="Cancel batch"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-300"
                style={{
                  width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                }}
              />
            </div>
            {/* Current item text */}
            {batchProgress.currentItemText && (
              <div className="truncate text-[9px] text-gray-500" title={batchProgress.currentItemText}>
                {batchProgress.currentItemText.length > 30
                  ? batchProgress.currentItemText.slice(0, 30) + '...'
                  : batchProgress.currentItemText}
              </div>
            )}
            {/* Running cost */}
            {batchProgress.accumulatedCost > 0 && (
              <div className="text-[9px] text-gray-500">
                ~${batchProgress.accumulatedCost < 0.01
                  ? batchProgress.accumulatedCost.toFixed(4)
                  : batchProgress.accumulatedCost < 1
                    ? batchProgress.accumulatedCost.toFixed(3)
                    : batchProgress.accumulatedCost.toFixed(2)} spent
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {hasError && execState?.error && (
          <div className="rounded-md border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-400">
            {execState.error}
          </div>
        )}

        {/* Batch result summary */}
        {batchResults && batchResults.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-gray-400">
              {(() => {
                const done = batchResults.filter((r: { status: string }) => r.status === 'done').length;
                const errors = batchResults.filter((r: { status: string }) => r.status === 'error').length;
                const total = batchResults.length;
                if (errors > 0) {
                  return `${done}/${total} done, ${errors} error${errors > 1 ? 's' : ''}`;
                }
                return `${done}/${total} done`;
              })()}
            </div>
            {/* Retry failed button */}
            {hasFailedItems && !isRunning && !isPending && (
              <button
                className="nodrag flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-amber-400 transition-colors hover:bg-amber-500/10"
                onClick={handleRetryFailed}
              >
                <RotateCcw className="h-3 w-3" />
                Retry failed
              </button>
            )}
          </div>
        )}

        {/* Summary toast */}
        {toastMessage && (
          <div
            className={`rounded-md px-2 py-1 text-[10px] ${
              toastType === 'success'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-amber-500/10 text-amber-400'
            }`}
          >
            {toastMessage}
          </div>
        )}

        {/* Idle state: shimmer placeholder */}
        {!isRunning && !isPending && !batchProgress && !hasError && (!batchResults || batchResults.length === 0) && (
          <ShimmerPlaceholder />
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-white/5 px-3 py-2 space-y-2">
        {/* Value editor */}
        <BatchValueEditor
          values={values}
          onChange={handleValuesChange}
          disabled={isRunning || isPending}
        />

        {/* Error mode toggle */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            On Error
          </label>
          <div className="flex gap-0.5">
            {(['skip', 'stop'] as const).map((mode) => (
              <button
                key={mode}
                className={`nodrag rounded px-2 py-0.5 text-[10px] transition-colors ${
                  errorMode === mode
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                } disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() => updateNodeData(nodeId, { errorMode: mode })}
                disabled={isRunning || isPending}
              >
                {mode === 'skip' ? 'Continue' : 'Stop'}
              </button>
            ))}
          </div>
        </div>

        {/* Append mode toggle */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Re-run Mode
          </label>
          <div className="flex gap-0.5">
            {([false, true] as const).map((mode) => (
              <button
                key={String(mode)}
                className={`nodrag rounded px-2 py-0.5 text-[10px] transition-colors ${
                  appendMode === mode
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                } disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() => updateNodeData(nodeId, { appendMode: mode })}
                disabled={isRunning || isPending}
              >
                {mode ? 'Append' : 'Replace'}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

