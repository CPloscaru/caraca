'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { Video, Play, Loader2 } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode } from '@/lib/executors';
import { ModelSelector, formatFalPrice } from './ModelSelector';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VideoResult, GenerationProgress } from './VideoPlayer';
import { getStatusBorderClass, ShimmerPlaceholder } from './node-utils';
import {
  fetchModelSchema,
  deriveNodeConfig,
  type ModelNodeConfig,
} from '@/lib/video/schema-introspection';
import type { TextToVideoData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Default config (fallback before schema introspection runs)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ModelNodeConfig = {
  hasPrompt: true,
  hasImageUrl: false,
  hasLastFrame: false,
  hasSeed: true,
  hasDuration: true,
  hasAspectRatio: true,
};

const DEFAULT_MODEL = 'fal-ai/minimax/video-01-live';

// ---------------------------------------------------------------------------
// TextToVideoNode
// ---------------------------------------------------------------------------

export function TextToVideoNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as TextToVideoData;

  // Execution state
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);
  const isRunning = execState?.status === 'running';
  const isPending = execState?.status === 'pending';
  const hasError = execState?.status === 'error';
  const isDone = execState?.status === 'done';

  // Canvas store
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const edges = useEdges();

  // Derived data
  const model = nodeData.model ?? DEFAULT_MODEL;
  const aspectRatio = nodeData.aspectRatio ?? '16:9';
  const duration = nodeData.duration ?? 5;
  const seed = nodeData.seed ?? null;
  const videoUrl = nodeData.videoUrl ?? null;
  const cdnUrl = nodeData.cdnUrl ?? null;

  // Pricing info from ModelSelector
  const unitPrice = (nodeData as Record<string, unknown>).unitPrice as number | null ?? null;
  const priceUnit = (nodeData as Record<string, unknown>).priceUnit as string | null ?? null;
  const costTooltip = formatFalPrice(unitPrice, priceUnit);

  const statusBorder = getStatusBorderClass(execState?.status);

  // Schema-driven config
  const [config, setConfig] = useState<ModelNodeConfig>(DEFAULT_CONFIG);

  // Track previous hasPrompt to auto-disconnect edges
  const prevHasPrompt = useRef(config.hasPrompt);

  // Fetch schema on model change
  useEffect(() => {
    let cancelled = false;
    fetchModelSchema(model).then((fields) => {
      if (cancelled) return;
      if (fields.length > 0) {
        setConfig(deriveNodeConfig(fields));
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    });
    return () => { cancelled = true; };
  }, [model]);

  // Auto-disconnect prompt edge when model no longer supports prompt
  useEffect(() => {
    if (prevHasPrompt.current && !config.hasPrompt) {
      const promptEdge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
      );
      if (promptEdge) {
        deleteEdge(promptEdge.id);
        console.warn(
          `[TextToVideo] Auto-disconnected prompt wire - model "${model}" does not support prompts`,
        );
      }
    }
    prevHasPrompt.current = config.hasPrompt;
  }, [config.hasPrompt, edges, nodeId, model, deleteEdge]);

  // Update helpers
  const updateData = useCallback(
    (field: string, value: unknown) => {
      updateNodeData(nodeId, { [field]: value });
    },
    [nodeId, updateNodeData],
  );

  const handleModelChange = useCallback(
    (newModel: string) => {
      updateNodeData(nodeId, { model: newModel });
    },
    [nodeId, updateNodeData],
  );

  // Check text input connected
  const textInputConnected = useMemo(
    () =>
      edges.some(
        (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
      ),
    [edges, nodeId],
  );

  // Aspect ratio options
  const aspectOptions = config.aspectRatioOptions ?? ['16:9', '9:16', '1:1'];
  // Duration options
  const durationOptions = config.durationOptions ?? [5, 10];

  return (
    <div
      className={`group relative rounded-lg border-2 bg-[#1a1a1a] shadow-lg transition-all ${statusBorder} ${
        selected ? 'ring-2 ring-[#ae53ba] ring-offset-1 ring-offset-transparent' : ''
      }`}
      style={{ minWidth: 320, maxWidth: 400 }}
    >
      {/* Input handles */}
      {config.hasPrompt && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="text"
          portId="text-in-0"
          index={0}
          style={{ top: '30%' }}
        />
      )}

      {/* Output handle - video */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType="video"
        portId="video-out-0"
        index={0}
        style={{ top: '50%' }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <Video className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-semibold text-gray-100">
          Text to Video
        </span>
        <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
          Text to Video
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {/* Running/pending state: generation progress */}
        {(isRunning || isPending) && (
          <GenerationProgress nodeId={nodeId} />
        )}

        {/* Error state */}
        {hasError && execState?.error && (
          <div className="rounded-md border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-400">
            {execState.error}
          </div>
        )}

        {/* Done state: video result (also shown after refresh) */}
        {!isRunning && !isPending && videoUrl && (
          <VideoResult videoUrl={videoUrl} cdnUrl={cdnUrl} nodeId={nodeId} />
        )}

        {/* Idle state: shimmer placeholder */}
        {!isRunning && !isPending && !videoUrl && !hasError && (
          <ShimmerPlaceholder />
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-white/5 px-3 py-2">
        {/* Model selector */}
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Model
          </label>
          <ModelSelector
            value={model}
            onChange={handleModelChange}
            mode="text-to-video"
            onPricingInfo={(info) => updateNodeData(nodeId, { unitPrice: info.unitPrice, priceUnit: info.priceUnit })}
          />
        </div>

        {/* Aspect ratio */}
        {config.hasAspectRatio && (
          <div className="mb-2">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Aspect Ratio
            </label>
            <div className="flex gap-0.5">
              {aspectOptions.map((ar) => (
                <button
                  key={ar}
                  className={`nodrag rounded px-2 py-0.5 text-[10px] transition-colors ${
                    aspectRatio === ar
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                  }`}
                  onClick={() => updateData('aspectRatio', ar)}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Duration */}
        {config.hasDuration && (
          <div className="mb-2">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Duration
            </label>
            <div className="flex gap-0.5">
              {durationOptions.map((d) => (
                <button
                  key={d}
                  className={`nodrag rounded px-2 py-0.5 text-[10px] transition-colors ${
                    duration === d
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                  }`}
                  onClick={() => updateData('duration', d)}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Seed */}
        {config.hasSeed && (
          <div className="mb-2">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Seed
            </label>
            <input
              type="number"
              className="nodrag w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-white/20"
              placeholder="Random"
              value={seed ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                updateData('seed', v === '' ? null : Number(v));
              }}
            />
          </div>
        )}

        {/* Prompt (inline) when text input not connected */}
        {config.hasPrompt && (
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
                placeholder="Describe the video you want to generate..."
                rows={2}
                value={nodeData.prompt ?? ''}
                onChange={(e) => updateData('prompt', e.target.value)}
              />
            )}
          </div>
        )}
      </div>

      {/* Run button — flow-based bottom-right */}
      <div className="flex justify-end p-2 pt-0">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="nodrag flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg transition-all hover:bg-amber-500"
                onClick={() => {
                  if (isRunning || isPending) {
                    useExecutionStore.getState().cancelExecution();
                  } else {
                    updateNodeData(nodeId, { videoUrl: null, cdnUrl: null });
                    runSingleNode(nodeId).catch((err) => {
                      console.error('Single node execution failed:', err);
                    });
                  }
                }}
                title={isRunning || isPending ? 'Cancel' : undefined}
              >
                {isRunning || isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            {costTooltip && !(isRunning || isPending) && (
              <TooltipContent>~{costTooltip}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

    </div>
  );
}
