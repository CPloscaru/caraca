'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { Bot, Play, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode } from '@/lib/executors';
import { LLMModelSelector, useLLMModelData } from './LLMModelSelector';
import type { LLMAssistantData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Execution status border
// ---------------------------------------------------------------------------

function getStatusBorderClass(status?: string): string {
  switch (status) {
    case 'pending':
      return 'border-gray-600';
    case 'running':
      return 'border-blue-500 animate-pulse';
    case 'done':
      return 'border-green-500';
    case 'error':
      return 'border-red-500';
    default:
      return 'border-[#2a2a2a]';
  }
}

// ---------------------------------------------------------------------------
// LLMAssistantNode
// ---------------------------------------------------------------------------

export function LLMAssistantNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as LLMAssistantData;

  // Execution state
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);
  const isRunning = execState?.status === 'running';
  const hasError = execState?.status === 'error';

  // Canvas store
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // Edges for connection detection
  const edges = useEdges();
  const imageInputConnected = useMemo(
    () =>
      edges.some(
        (e) => e.target === nodeId && e.targetHandle === 'image-target-0',
      ),
    [edges, nodeId],
  );

  // Model data for vision check
  const llmModels = useLLMModelData();
  const selectedModelData = useMemo(
    () => llmModels.find((m) => m.model_id === nodeData.model),
    [llmModels, nodeData.model],
  );
  const showVisionWarning =
    imageInputConnected &&
    nodeData.model &&
    selectedModelData &&
    !selectedModelData.supports_vision;

  // Local instruction state with debounce
  const [localInstruction, setLocalInstruction] = useState(
    nodeData.instruction ?? '',
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalInstruction(nodeData.instruction ?? '');
  }, [nodeData.instruction]);

  const handleInstructionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalInstruction(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNodeData(nodeId, { instruction: val });
      }, 300);
    },
    [nodeId, updateNodeData],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Output data
  const output = nodeData.output ?? null;
  const outputExpanded = nodeData.outputExpanded ?? false;
  const tokenUsage = nodeData.tokenUsage ?? null;

  const toggleExpanded = useCallback(() => {
    updateNodeData(nodeId, { outputExpanded: !outputExpanded });
  }, [nodeId, outputExpanded, updateNodeData]);

  const statusBorder = getStatusBorderClass(execState?.status);

  return (
    <div
      className={`group relative rounded-lg border-2 bg-[#1a1a1a] shadow-lg transition-all ${statusBorder} ${
        selected
          ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-transparent'
          : ''
      }`}
      style={{ minWidth: 300, maxWidth: 380 }}
    >
      {/* Image input handle (left) */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="image"
        portId="image-in-0"
        index={0}
        style={{ top: '50%' }}
      />

      {/* Text output handle (right) */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType="text"
        portId="text-out-0"
        index={0}
        style={{ top: '50%' }}
      />

      {/* Header with emerald accent */}
      <div
        className="flex items-center gap-2 border-b border-white/5 px-3 py-2"
        style={{ borderTop: '3px solid #22c55e', borderRadius: '6px 6px 0 0' }}
      >
        <Bot className="h-4 w-4 text-emerald-400" />
        <span className="text-xs font-semibold text-gray-100">
          LLM Assistant
        </span>
        {imageInputConnected && (
          <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
            vision
          </span>
        )}
      </div>

      {/* Vision warning */}
      {showVisionWarning && (
        <div className="mx-3 mt-2 flex items-center gap-1.5 rounded border border-yellow-500/20 bg-yellow-500/5 px-2 py-1.5 text-[10px] text-yellow-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Model does not support vision
        </div>
      )}

      {/* Instruction textarea */}
      <div className="px-3 py-2">
        <textarea
          className="nodrag nowheel w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-500/50"
          placeholder="Write your instruction for the LLM..."
          rows={3}
          value={localInstruction}
          onChange={handleInstructionChange}
        />
      </div>

      {/* Model selector */}
      <div className="px-3 pb-2">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Model
        </label>
        <LLMModelSelector
          value={nodeData.model ?? ''}
          onSelect={(modelId) => updateNodeData(nodeId, { model: modelId })}
        />
      </div>

      {/* Output panel */}
      {output && (
        <div className="border-t border-white/5 px-3 py-2">
          <button
            className="nodrag flex w-full items-center gap-1 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-300"
            onClick={toggleExpanded}
          >
            {outputExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            Output
          </button>
          <div
            className={`mt-1 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-gray-300 ${
              outputExpanded ? '' : 'line-clamp-3'
            }`}
          >
            {output}
          </div>
        </div>
      )}

      {/* Token usage */}
      {tokenUsage && (
        <div className="px-3 pb-2">
          <span className="text-[10px] text-gray-600">
            In: {tokenUsage.prompt.toLocaleString()} | Out:{' '}
            {tokenUsage.completion.toLocaleString()}
          </span>
        </div>
      )}

      {/* Error */}
      {hasError && execState?.error && (
        <div className="mx-3 mb-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {execState.error}
        </div>
      )}

      {/* Run button */}
      <button
        className="nodrag absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isRunning}
        onClick={() => {
          runSingleNode(nodeId).catch((err) => {
            console.error('LLM execution failed:', err);
          });
        }}
        title="Run LLM"
      >
        <Play className="h-4 w-4" />
      </button>
    </div>
  );
}
