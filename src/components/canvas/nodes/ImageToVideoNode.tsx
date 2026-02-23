'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { Video, Play } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode } from '@/lib/executors';
import { ModelSelector } from './ModelSelector';
import { VideoResult, GenerationProgress } from './VideoPlayer';
import {
  fetchModelSchema,
  deriveNodeConfig,
  type ModelNodeConfig,
} from '@/lib/video/schema-introspection';
import type { ImageToVideoData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Default config (fallback before schema introspection runs)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ModelNodeConfig = {
  hasPrompt: true,
  hasImageUrl: true,
  hasLastFrame: false,
  hasSeed: false,
  hasDuration: true,
  hasAspectRatio: true,
};

const DEFAULT_MODEL = 'fal-ai/minimax/video-01-live/image-to-video';

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
// ImageToVideoNode
// ---------------------------------------------------------------------------

export function ImageToVideoNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as ImageToVideoData;

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

  const statusBorder = getStatusBorderClass(execState?.status);

  // Schema-driven config
  const [config, setConfig] = useState<ModelNodeConfig>(DEFAULT_CONFIG);

  // Track previous port states to auto-disconnect edges on model change
  const prevHasPrompt = useRef(config.hasPrompt);
  const prevHasImageUrl = useRef(config.hasImageUrl);
  const prevHasLastFrame = useRef(config.hasLastFrame);

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

  // Auto-disconnect edges when ports disappear on model change
  useEffect(() => {
    const disconnects: Array<{ handleId: string; label: string }> = [];

    if (prevHasPrompt.current && !config.hasPrompt) {
      disconnects.push({ handleId: 'text-target-0', label: 'prompt' });
    }
    if (prevHasImageUrl.current && !config.hasImageUrl) {
      disconnects.push({ handleId: 'image-target-0', label: 'image' });
    }
    if (prevHasLastFrame.current && !config.hasLastFrame) {
      disconnects.push({ handleId: 'image-target-1', label: 'last frame' });
    }

    for (const { handleId, label } of disconnects) {
      const edge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === handleId,
      );
      if (edge) {
        deleteEdge(edge.id);
        console.warn(
          `[ImageToVideo] Auto-disconnected ${label} wire - model "${model}" does not support ${label}`,
        );
      }
    }

    prevHasPrompt.current = config.hasPrompt;
    prevHasImageUrl.current = config.hasImageUrl;
    prevHasLastFrame.current = config.hasLastFrame;
  }, [config.hasPrompt, config.hasImageUrl, config.hasLastFrame, edges, nodeId, model, deleteEdge]);

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
      {config.hasImageUrl && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="image"
          portId="image-in-0"
          index={0}
          style={{ top: '25%' }}
        />
      )}
      {config.hasPrompt && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="text"
          portId="text-in-0"
          index={1}
          style={{ top: '45%' }}
        />
      )}
      {config.hasLastFrame && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="image"
          portId="image-in-1"
          index={2}
          style={{ top: '65%' }}
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
          Image to Video
        </span>
        <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
          Image to Video
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
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {execState.error}
          </div>
        )}

        {/* Done state: video result */}
        {isDone && videoUrl && !isRunning && (
          <VideoResult videoUrl={videoUrl} cdnUrl={cdnUrl} nodeId={nodeId} />
        )}

        {/* Idle state: placeholder */}
        {!isRunning && !isPending && !isDone && !hasError && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-white/5 bg-white/[0.02] py-8">
            <Video className="h-8 w-8 text-gray-600" />
            <span className="text-xs text-gray-500">Run to generate video</span>
          </div>
        )}
      </div>

      {/* Controls - revealed on hover */}
      <div className="border-t border-white/5 px-3 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {/* Model selector */}
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Model
          </label>
          <ModelSelector
            value={model}
            onChange={handleModelChange}
            mode="image-to-video"
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
                placeholder="Describe the motion or scene..."
                rows={2}
                value={nodeData.prompt ?? ''}
                onChange={(e) => updateData('prompt', e.target.value)}
              />
            )}
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        className="nodrag absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg transition-all hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isRunning || isPending}
        onClick={() => {
          updateNodeData(nodeId, { videoUrl: null, cdnUrl: null });
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
