'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { ArrowUpDown, Play } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode } from '@/lib/executors';
import { ModelSelector } from './ModelSelector';
import { ComparisonSlider } from './ComparisonSlider';
import { getModelParams, DEFAULT_UPSCALE_MODEL } from '@/lib/upscale/model-params';
import type { ImageUpscaleData } from '@/types/canvas';

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
// Shimmer loading animation
// ---------------------------------------------------------------------------

function ShimmerPlaceholder() {
  return (
    <div
      className="shimmer-loading w-full overflow-hidden rounded-md"
      style={{ aspectRatio: '1/1' }}
    />
  );
}

// ---------------------------------------------------------------------------
// ImageUpscaleNode
// ---------------------------------------------------------------------------

export function ImageUpscaleNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as ImageUpscaleData;

  // Execution state
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);
  const isRunning = execState?.status === 'running';
  const hasError = execState?.status === 'error';
  const isDone = execState?.status === 'done';

  // Canvas store
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const edges = useEdges();

  // Derived data
  const model = nodeData.model ?? DEFAULT_UPSCALE_MODEL;
  const scaleFactor = nodeData.scaleFactor ?? getModelParams(model).defaultScale;
  const prompt = nodeData.prompt ?? '';
  const outputImage = nodeData.outputImage ?? null;
  const inputImageUrl = nodeData.inputImageUrl ?? null;
  const inputDimensions = nodeData.inputDimensions ?? null;

  const modelParams = useMemo(() => getModelParams(model), [model]);
  const statusBorder = getStatusBorderClass(execState?.status);

  // Track previous supportsPrompt to detect model switches
  const prevSupportsPrompt = useRef(modelParams.supportsPrompt);

  // Auto-disconnect prompt edge when switching to a non-prompt model
  useEffect(() => {
    if (prevSupportsPrompt.current && !modelParams.supportsPrompt) {
      const promptEdge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
      );
      if (promptEdge) {
        deleteEdge(promptEdge.id);
        console.warn(
          `[ImageUpscale] Auto-disconnected prompt wire — model "${model}" does not support prompts`,
        );
      }
    }
    prevSupportsPrompt.current = modelParams.supportsPrompt;
  }, [modelParams.supportsPrompt, edges, nodeId, model, deleteEdge]);

  // Probe input image dimensions when we have a URL but no dimensions
  useEffect(() => {
    if (inputImageUrl && !inputDimensions) {
      const img = new Image();
      img.onload = () => {
        updateNodeData(nodeId, {
          inputDimensions: { width: img.naturalWidth, height: img.naturalHeight },
        });
      };
      img.src = inputImageUrl;
    }
  }, [inputImageUrl, inputDimensions, nodeId, updateNodeData]);

  // Update helpers
  const updateData = useCallback(
    (field: string, value: unknown) => {
      updateNodeData(nodeId, { [field]: value });
    },
    [nodeId, updateNodeData],
  );

  // Handle model change — reset scale factor if current value is not valid for new model
  const handleModelChange = useCallback(
    (newModel: string) => {
      const newParams = getModelParams(newModel);
      updateNodeData(nodeId, {
        model: newModel,
        // Reset scale if current value is not in the new model's range
        ...(!newParams.scaleRange.includes(scaleFactor)
          ? { scaleFactor: newParams.defaultScale }
          : {}),
      });
    },
    [nodeId, scaleFactor, updateNodeData],
  );

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Check if text input port is connected
  const textInputConnected = useMemo(
    () =>
      edges.some(
        (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
      ),
    [edges, nodeId],
  );

  return (
    <div
      className={`group relative rounded-lg border-2 bg-[#1a1a1a] shadow-lg transition-all ${statusBorder} ${
        selected ? 'ring-2 ring-[#ae53ba] ring-offset-1 ring-offset-transparent' : ''
      }`}
      style={{ minWidth: 320, maxWidth: 400 }}
    >
      {/* Input handles */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="image"
        portId="image-in-0"
        index={0}
        style={{ top: '30%' }}
      />
      {modelParams.supportsPrompt && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="text"
          portId="text-in-0"
          index={0}
          style={{ top: '60%' }}
        />
      )}

      {/* Output handle */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType="image"
        portId="image-out-0"
        index={0}
        style={{ top: '50%' }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <ArrowUpDown className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-semibold text-gray-100">
          Image Upscale
        </span>
      </div>

      {/* Result area */}
      <div className="px-3 py-2">
        {/* Running state: shimmer */}
        {isRunning && <ShimmerPlaceholder />}

        {/* Error state */}
        {hasError && execState?.error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {execState.error}
          </div>
        )}

        {/* Done state: comparison slider + dimensions */}
        {isDone && outputImage && inputImageUrl && !isRunning && (
          <div>
            <div
              className="cursor-pointer"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              title="Double-click to view full size"
            >
              <ComparisonSlider
                beforeUrl={inputImageUrl}
                afterUrl={outputImage.url}
              />
            </div>
            {inputDimensions && (
              <div className="mt-1 text-center text-[10px] text-gray-500">
                {inputDimensions.width}x{inputDimensions.height} &rarr;{' '}
                {outputImage.width}x{outputImage.height}
              </div>
            )}
          </div>
        )}

        {/* Pre-execution placeholder */}
        {!isRunning && !isDone && !hasError && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-white/5 bg-white/[0.02] py-8">
            <ArrowUpDown className="h-8 w-8 text-gray-600" />
            <span className="text-xs text-gray-500">Run to upscale</span>
          </div>
        )}
      </div>

      {/* Controls (below image area) -- revealed on hover */}
      <div className="border-t border-white/5 px-3 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {/* Model selector */}
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Model
          </label>
          <ModelSelector
            value={model}
            onChange={handleModelChange}
            mode="image-upscaling"
          />
        </div>

        {/* Scale factor */}
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Scale
          </label>
          <div className="flex gap-0.5">
            {modelParams.scaleRange.map((s) => (
              <button
                key={s}
                className={`nodrag rounded px-2 py-0.5 text-[10px] transition-colors ${
                  scaleFactor === s
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                }`}
                onClick={() => updateData('scaleFactor', s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic prompt field (only when model supports prompts) */}
        {modelParams.supportsPrompt && (
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Prompt
            </label>
            {textInputConnected ? (
              <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-gray-500">
                Prompt from connected node
              </div>
            ) : (
              <textarea
                className="nodrag nowheel w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-white/20"
                placeholder="Describe the enhancement..."
                rows={2}
                value={prompt}
                onChange={(e) => updateData('prompt', e.target.value)}
              />
            )}
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        className="nodrag absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-all hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isRunning}
        onClick={() => {
          // Clear previous result when re-running
          updateNodeData(nodeId, { outputImage: null, inputImageUrl: null, inputDimensions: null });
          runSingleNode(nodeId).catch((err) => {
            console.error('Single node execution failed:', err);
          });
        }}
        title="Run upscale"
      >
        <Play className="h-4 w-4" />
      </button>

      {/* Fullscreen comparison lightbox */}
      {outputImage && inputImageUrl && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent
            showCloseButton
            className="max-h-[90vh] max-w-[90vw] border-white/10 bg-[#0a0a0a] p-0 sm:max-w-[90vw]"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Upscale comparison</DialogTitle>
            <div className="flex flex-col items-center gap-2 p-4">
              <ComparisonSlider
                beforeUrl={inputImageUrl}
                afterUrl={outputImage.url}
              />
              {inputDimensions && (
                <div className="text-xs text-gray-500">
                  {inputDimensions.width}x{inputDimensions.height} &rarr;{' '}
                  {outputImage.width}x{outputImage.height}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Shimmer CSS */}
      <style>{`
        .shimmer-loading {
          background: linear-gradient(
            90deg,
            #1a1a1a 25%,
            #2a2a2a 50%,
            #1a1a1a 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
