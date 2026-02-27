'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { DebugToggleButton, JsonDebugPanel } from './JsonDebugPanel';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode } from '@/lib/executors';
import { LLMModelSelector, useLLMModelData, formatLLMPricing, LLMModelDetails } from './LLMModelSelector';
import { NodeFooter } from './shared/NodeFooter';
import { getStatusBorderClass } from './node-utils';
import type { LLMAssistantData } from '@/types/canvas';

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
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);

  // Edges for connection detection
  const edges = useEdges();

  // Model data for vision check
  const llmModels = useLLMModelData();
  const selectedModelData = useMemo(
    () => llmModels.find((m) => m.model_id === nodeData.model),
    [llmModels, nodeData.model],
  );
  const supportsVision = selectedModelData?.supports_vision ?? false;

  // Track previous vision state to clean up stale edges on model switch
  const prevVisionRef = useRef(supportsVision);
  useEffect(() => {
    if (prevVisionRef.current && !supportsVision) {
      // Switched from vision to non-vision: remove stale image edges
      const staleEdges = edges.filter(
        (e) => e.target === nodeId && e.targetHandle === 'image-target-0',
      );
      for (const edge of staleEdges) {
        deleteEdge(edge.id);
      }
    }
    prevVisionRef.current = supportsVision;
  }, [supportsVision, edges, nodeId, deleteEdge]);

  // LLM pricing tooltip
  const llmCostTooltip = selectedModelData
    ? formatLLMPricing(selectedModelData.pricing_prompt, selectedModelData.pricing_completion)
    : null;

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

  // Debug mode
  const [debugMode, setDebugMode] = useState(false);

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
      {/* Image input handle (left) — only when model supports vision */}
      {supportsVision && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="image"
          portId="image-in-0"
          index={0}
          style={{ top: '50%' }}
        />
      )}

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
        <span className="ml-auto flex items-center gap-1">
          {supportsVision && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
              vision
            </span>
          )}
          <DebugToggleButton active={debugMode} onClick={() => setDebugMode((v) => !v)} className="" />
        </span>
      </div>

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

      {/* Output / Debug panel */}
      <div className="border-t border-white/5 px-3 py-2">
        {debugMode ? (
          <JsonDebugPanel
            schema={{ model: nodeData.model, instruction: nodeData.instruction }}
            request={nodeData.debugRequest}
            response={nodeData.debugResponse}
            error={nodeData.debugError}
          />
        ) : (
          <>
            {/* Output */}
            {output && (
              <>
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
              </>
            )}

            {/* Token usage */}
            {tokenUsage && (
              <div className="pt-1">
                <span className="text-[10px] text-gray-600">
                  In: {tokenUsage.prompt.toLocaleString()} | Out:{' '}
                  {tokenUsage.completion.toLocaleString()}
                </span>
              </div>
            )}

            {/* Error */}
            {hasError && execState?.error && (
              <div className="mt-1 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                {execState.error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: info button + run button */}
      <NodeFooter
        infoSlot={selectedModelData ? <LLMModelDetails model={selectedModelData} /> : undefined}
        isRunning={isRunning}
        onRun={() => {
          if (isRunning) {
            useExecutionStore.getState().cancelExecution();
          } else {
            runSingleNode(nodeId).catch((err) => {
              console.error('LLM execution failed:', err);
            });
          }
        }}
        costTooltip={llmCostTooltip}
        accentColor="emerald"
      />
    </div>
  );
}
