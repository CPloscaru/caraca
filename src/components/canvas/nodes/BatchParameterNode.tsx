'use client';

import { useCallback, useMemo } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { List, Play } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runBatchNode } from '@/lib/executors';
import { getPortTypeFromHandleId, type PortType } from '@/lib/port-types';
import { BatchValueEditor } from './BatchValueEditor';
import { getStatusBorderClass } from './node-utils';
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

  // ---------------------------------------------------------------------------
  // Dynamic output port type
  // ---------------------------------------------------------------------------
  const outputPortType: PortType = useMemo(() => {
    // Find outgoing edges from this node
    const outEdge = edges.find((e) => e.source === nodeId);
    if (outEdge?.targetHandle) {
      const targetType = getPortTypeFromHandleId(outEdge.targetHandle);
      if (targetType) return targetType;
    }
    return 'text'; // default when unconnected
  }, [edges, nodeId]);

  // ---------------------------------------------------------------------------
  // Update helpers
  // ---------------------------------------------------------------------------
  const handleValuesChange = useCallback(
    (newValues: string[]) => {
      updateNodeData(nodeId, { values: newValues });
    },
    [nodeId, updateNodeData],
  );

  const handleRunBatch = useCallback(() => {
    runBatchNode(nodeId).catch((err) => {
      console.error('Batch execution failed:', err);
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

      {/* Body */}
      <div className="px-3 py-2 space-y-2">
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

        {/* Progress section (during execution) */}
        {batchProgress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-teal-400">
                Running {batchProgress.current}/{batchProgress.total}
              </span>
              <span className="text-gray-500">
                {Math.round(
                  (batchProgress.current / batchProgress.total) * 100,
                )}
                %
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-300"
                style={{
                  width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {hasError && execState?.error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1.5 text-[10px] text-red-400">
            {execState.error}
          </div>
        )}

        {/* Batch result summary */}
        {batchResults && batchResults.length > 0 && (
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
        )}
      </div>

      {/* Run Batch button */}
      <button
        className="nodrag absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-all hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={values.length === 0 || isRunning || isPending}
        onClick={handleRunBatch}
        title="Run batch"
      >
        <Play className="h-4 w-4" />
      </button>
    </div>
  );
}

export default BatchParameterNode;
