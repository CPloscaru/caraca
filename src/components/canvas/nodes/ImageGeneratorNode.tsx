'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { Sparkles, Play, Minus, Plus } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode } from '@/lib/executors';
import { ModelSelector } from './ModelSelector';
import { ImageResultGrid } from './ImageResultGrid';
import type { ImageGeneratorData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASPECT_RATIO_PRESETS: Record<
  string,
  { width: number; height: number; label: string }
> = {
  '1:1': { width: 1024, height: 1024, label: '1:1' },
  '3:4': { width: 768, height: 1024, label: '3:4' },
  '4:3': { width: 1024, height: 768, label: '4:3' },
  '9:16': { width: 576, height: 1024, label: '9:16' },
  '16:9': { width: 1024, height: 576, label: '16:9' },
};

const DEFAULT_MODEL = 'fal-ai/flux/dev';

// ---------------------------------------------------------------------------
// Shimmer loading animation component
// ---------------------------------------------------------------------------

function ShimmerPlaceholder({ aspectRatio }: { aspectRatio: string }) {
  const preset = ASPECT_RATIO_PRESETS[aspectRatio] ?? ASPECT_RATIO_PRESETS['1:1'];
  return (
    <div
      className="shimmer-loading w-full overflow-hidden rounded-md"
      style={{ aspectRatio: `${preset.width}/${preset.height}` }}
    />
  );
}

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
// ImageGeneratorNode
// ---------------------------------------------------------------------------

export function ImageGeneratorNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as ImageGeneratorData;

  // Execution state
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);
  const isRunning = execState?.status === 'running';
  const hasError = execState?.status === 'error';
  const isDone = execState?.status === 'done';

  // Canvas store for updating node data
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // Check if text input port is connected
  const edges = useEdges();
  const nodes = useCanvasStore((s) => s.nodes);
  const textInputConnected = useMemo(
    () =>
      edges.some(
        (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
      ),
    [edges, nodeId],
  );

  // Check if image input port is connected (for mode detection)
  const imageInputConnected = useMemo(
    () =>
      edges.some(
        (e) => e.target === nodeId && e.targetHandle === 'image-target-1',
      ),
    [edges, nodeId],
  );

  // Auto-switch to image-to-image mode when image input is connected.
  // Do NOT auto-revert when disconnected — user must manually change mode.
  const prevImageConnected = useRef(imageInputConnected);
  useEffect(() => {
    if (imageInputConnected && !prevImageConnected.current) {
      // Just connected — auto-switch to image-to-image
      updateNodeData(nodeId, { mode: 'image-to-image' });
    }
    prevImageConnected.current = imageInputConnected;
  }, [imageInputConnected, nodeId, updateNodeData]);

  // Find the source node label for the text connection
  const textSourceLabel = useMemo(() => {
    if (!textInputConnected) return null;
    const edge = edges.find(
      (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
    );
    if (!edge) return null;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    return (sourceNode?.data as Record<string, unknown>)?.label as string ?? 'Text Input';
  }, [edges, nodeId, nodes, textInputConnected]);

  // Update a specific data field
  const updateData = useCallback(
    (field: string, value: unknown) => {
      updateNodeData(nodeId, { [field]: value });
    },
    [nodeId, updateNodeData],
  );

  const handleSelectImage = useCallback(
    (index: number) => {
      updateNodeData(nodeId, { selectedImageIndex: index });
    },
    [nodeId, updateNodeData],
  );

  const prompt = nodeData.prompt ?? '';
  const model = nodeData.model ?? DEFAULT_MODEL;
  const aspectRatio = nodeData.aspectRatio ?? '1:1';
  const numImages = nodeData.numImages ?? 1;
  const images = nodeData.images ?? [];
  const selectedImageIndex = nodeData.selectedImageIndex ?? 0;
  const mode = nodeData.mode ?? 'text-to-image';

  const statusBorder = getStatusBorderClass(execState?.status);

  return (
    <div
      className={`group relative rounded-lg border-2 bg-[#1a1a1a] shadow-lg transition-all ${statusBorder} ${
        selected ? 'ring-2 ring-[#ae53ba] ring-offset-1 ring-offset-transparent' : ''
      }`}
      style={{
        minWidth: 320,
        maxWidth: 400,
        borderLeftColor: imageInputConnected ? '#2a8af6' : undefined,
        borderLeftWidth: imageInputConnected ? 3 : undefined,
      }}
    >
      {/* Input handles */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="text"
        portId="text-in-0"
        index={0}
        style={{ top: '30%' }}
      />
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="image"
        portId="image-in-0"
        index={1}
        style={{ top: '55%' }}
      />

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
        <Sparkles className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-semibold text-gray-100">
          Image Generator
        </span>
        {imageInputConnected && (
          <span className="ml-auto rounded bg-[#2a8af6]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#2a8af6]">
            img2img
          </span>
        )}
      </div>

      {/* Prompt area */}
      <div className="px-3 py-2">
        {textInputConnected ? (
          <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-gray-500">
            Prompt from: {textSourceLabel}
          </div>
        ) : (
          <textarea
            className="nodrag nowheel w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-white/20"
            placeholder="Describe the image you want to generate..."
            rows={3}
            value={prompt}
            onChange={(e) => updateData('prompt', e.target.value)}
          />
        )}
      </div>

      {/* Parameter bar */}
      <div className="border-t border-white/5 px-3 py-2">
        {/* Model selector */}
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Model
          </label>
          <ModelSelector
            value={model}
            onChange={(v) => updateData('model', v)}
            mode={mode === 'image-to-image' ? 'image-to-image' : 'text-to-image'}
          />
        </div>

        {/* Aspect ratio + count */}
        <div className="flex items-end gap-2">
          {/* Aspect ratio */}
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Aspect
            </label>
            <div className="flex gap-0.5">
              {Object.entries(ASPECT_RATIO_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  className={`nodrag rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    aspectRatio === key
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                  }`}
                  onClick={() => updateData('aspectRatio', key)}
                  title={`${preset.width}x${preset.height}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generation count */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Count
            </label>
            <div className="flex items-center gap-1">
              <button
                className="nodrag rounded bg-white/5 p-0.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                onClick={() =>
                  updateData('numImages', Math.max(1, numImages - 1))
                }
                disabled={numImages <= 1}
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-5 text-center text-xs text-gray-300">
                {numImages}
              </span>
              <button
                className="nodrag rounded bg-white/5 p-0.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                onClick={() =>
                  updateData('numImages', Math.min(4, numImages + 1))
                }
                disabled={numImages >= 4}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Result area */}
      <div className="px-3 pb-3">
        {/* Running state: shimmer */}
        {isRunning && <ShimmerPlaceholder aspectRatio={aspectRatio} />}

        {/* Error state: red inline message */}
        {hasError && execState?.error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {execState.error}
          </div>
        )}

        {/* Done state: image grid */}
        {isDone && images.length > 0 && (
          <ImageResultGrid
            images={images}
            selectedImageIndex={selectedImageIndex}
            onSelectImage={handleSelectImage}
          />
        )}
      </div>

      {/* Run button -- always visible at bottom-right */}
      <button
        className="nodrag absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-all hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isRunning}
        onClick={() => {
          runSingleNode(nodeId).catch((err) => {
            console.error('Single node execution failed:', err);
          });
        }}
        title="Run generation"
      >
        <Play className="h-4 w-4" />
      </button>

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
