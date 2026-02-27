'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useNodeId } from '@xyflow/react';
import { Video } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { ModelSelector, type CachedModel } from './ModelSelector';
import { BatchCostDialog } from './BatchCostDialog';
import { NodeFooter } from './shared/NodeFooter';
import { VideoResult, GenerationProgress } from './VideoPlayer';
import { VideoResultCarousel } from './VideoResultCarousel';
import { ShimmerPlaceholder } from './node-utils';
import {
  humanizeFieldName,
  type ModelNodeConfig,
  type DynamicImagePort,
} from '@/lib/fal/schema-introspection';
import { DebugToggleButton, JsonDebugPanel } from './JsonDebugPanel';
import { SchemaNodeRenderer } from './schema-widgets';
import type { SchemaNode } from '@/lib/fal/schema-tree';
import { isImageNode, isImageArrayNode, isTextNode } from '@/lib/fal/schema-ports';
import type { ImageToVideoData } from '@/types/canvas';
import { useFalNode } from '@/hooks/use-fal-node';
import { DynamicImageHandle, DynamicTextHandle } from './shared/DynamicHandles';

const I2V_EXCLUDE = new Set(['seed']);

const DEFAULT_CONFIG: ModelNodeConfig = {
  hasPrompt: true,
  hasImageUrl: true,
  hasLastFrame: false,
  hasSeed: true,
  hasDuration: true,
  hasAspectRatio: true,
  hasNumImages: false,
  hasGuidanceScale: false,
  hasNegativePrompt: false,
  hasImageSize: false,
};

const DEFAULT_MODEL = 'fal-ai/minimax/video-01-live/image-to-video';

// ---------------------------------------------------------------------------
// ImageToVideoNode
// ---------------------------------------------------------------------------

export function ImageToVideoNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as ImageToVideoData;

  const {
    execState,
    isRunning,
    isPending,
    hasError,
    handleRun,
    config,
    schemaFields,
    dynamicImagePorts,
    schemaTree,
    paramValues,
    setParam,
    filteredTree,
    debugMode,
    setDebugMode,
    costDialogOpen,
    setCostDialogOpen,
    handleCostConfirm,
    model,
    statusBorder,
    costTooltip,
    textInputConnected,
    updateData,
    updateNodeData,
    handleModelChange,
    upstreamBatch,
    edges,
  } = useFalNode({
    nodeId,
    nodeData: data as unknown as Record<string, unknown>,
    defaultModel: DEFAULT_MODEL,
    defaultConfig: DEFAULT_CONFIG,
    excludeParams: I2V_EXCLUDE,
    hasDynamicPorts: true,
    hasQueueStatus: true,
    clearBeforeRun: { videoUrl: null, cdnUrl: null, videoResults: null },
  });

  const [selectedModelInfo, setSelectedModelInfo] = useState<CachedModel | null>(null);

  // Derived data
  const aspectRatio = nodeData.aspectRatio ?? '16:9';
  const duration = nodeData.duration ?? 5;
  const seed = nodeData.seed ?? null;
  const videoUrl = nodeData.videoUrl ?? null;
  const cdnUrl = nodeData.cdnUrl ?? null;
  const videoResults = nodeData.videoResults ?? null;

  // I2V-specific: auto-disconnect old static handle IDs (migration from pre-Phase-25)
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    for (const oldStaticId of ['image-target-0', 'image-target-1']) {
      const staleEdge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === oldStaticId,
      );
      if (staleEdge) {
        deleteEdge(staleEdge.id);
      }
    }
  }, [edges, nodeId, deleteEdge]);

  // Build port lookup map for renderImagePort callback
  const portMap = useMemo(() => {
    const map = new Map<string, DynamicImagePort>();
    for (const port of dynamicImagePorts) {
      map.set(port.fieldName, port);
    }
    return map;
  }, [dynamicImagePorts]);

  const renderImagePort = useCallback((node: SchemaNode) => {
    const port = portMap.get(node.path);
    if (port) {
      const handleId = `image-target-${port.fieldName}`;
      return <DynamicImageHandle port={port} handleId={handleId} />;
    }

    const isImg = isImageNode(node);
    const isImgArr = isImageArrayNode(node);
    if (!isImg && !isImgArr) return null;

    const dynPort: DynamicImagePort = {
      fieldName: node.path,
      label: humanizeFieldName(node.name),
      required: node.required,
      description: node.description,
      multi: isImgArr,
      maxConnections: isImgArr ? node.maxItems : 1,
    };
    const handleId = `image-target-${node.path}`;
    return <DynamicImageHandle port={dynPort} handleId={handleId} />;
  }, [portMap]);

  const renderTextPort = useCallback((node: SchemaNode) => {
    if (!isTextNode(node)) return null;
    const handleId = `text-target-${node.path}`;
    const val = paramValues[node.path] as string | undefined;
    return (
      <DynamicTextHandle
        node={node}
        handleId={handleId}
        value={val}
        onChange={(v) => setParam(node.path, v)}
      />
    );
  }, [paramValues, setParam]);

  const aspectOptions = config.aspectRatioOptions ?? ['16:9', '9:16', '1:1'];
  const durationOptions = config.durationOptions ?? [5, 10];

  return (
    <div
      className={`group relative rounded-lg border-2 bg-[#1a1a1a] shadow-lg transition-all ${statusBorder} ${
        selected ? 'ring-2 ring-[#ae53ba] ring-offset-1 ring-offset-transparent' : ''
      }`}
      style={{ minWidth: 320, maxWidth: 400 }}
    >
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
      <div className="relative px-3 py-2">
        <DebugToggleButton active={debugMode} onClick={() => setDebugMode((v) => !v)} />
        {debugMode ? (
          <JsonDebugPanel
            schema={schemaFields}
            schemaTree={schemaTree}
            config={{ model, prompt: nodeData.prompt, aspectRatio, duration, seed }}
            request={nodeData.debugRequest}
            response={nodeData.debugResponse}
            error={nodeData.debugError}
          />
        ) : (
          <>
            {(isRunning || isPending) && (
              <GenerationProgress nodeId={nodeId} />
            )}
            {hasError && execState?.error && (
              <div className="rounded-md border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-400">
                {execState.error}
              </div>
            )}
            {!isRunning && !isPending && videoResults && videoResults.length > 1 && (
              <VideoResultCarousel videos={videoResults} />
            )}
            {!isRunning && !isPending && !(videoResults && videoResults.length > 1) && videoUrl && (
              <VideoResult videoUrl={videoUrl} cdnUrl={cdnUrl} nodeId={nodeId} />
            )}
            {!isRunning && !isPending && !videoUrl && !hasError && (
              <ShimmerPlaceholder />
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-white/5 px-3 py-2">
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Model
          </label>
          <ModelSelector
            value={model}
            onChange={handleModelChange}
            mode="image-to-video"
            onPricingInfo={(info) => updateNodeData(nodeId, { unitPrice: info.unitPrice, priceUnit: info.priceUnit })}
            onModelInfo={setSelectedModelInfo}
          />
        </div>

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

        {config.hasDuration && (
          <div className="mb-2">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Duration
            </label>
            <div className="flex flex-wrap gap-0.5">
              {durationOptions.map((d) => (
                <button
                  key={d}
                  className={`nodrag rounded px-2 py-0.5 text-[10px] transition-colors ${
                    String(duration) === String(d)
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

        {filteredTree.length > 0 ? (
          <div className="mb-2 space-y-1">
            {filteredTree.map((node) => (
              <SchemaNodeRenderer
                key={node.path}
                node={node}
                values={paramValues}
                onChange={setParam}
                renderImagePort={renderImagePort}
                renderTextPort={renderTextPort}
              />
            ))}
          </div>
        ) : null}

        {config.hasPrompt && (
          <div className="relative">
            <TypedHandle
              type="target"
              position={Position.Left}
              portType="text"
              portId="text-in-0"
              index={0}
              style={{ left: 0 }}
            />
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

      <BatchCostDialog
        open={costDialogOpen}
        onConfirm={handleCostConfirm}
        onCancel={() => setCostDialogOpen(false)}
        itemCount={upstreamBatch?.values.length ?? 0}
        unitPrice={(nodeData as Record<string, unknown>).unitPrice as number | null ?? null}
        priceUnit={(nodeData as Record<string, unknown>).priceUnit as string | null ?? null}
        modelName={model}
      />

      <NodeFooter
        modelInfo={selectedModelInfo}
        isRunning={isRunning || isPending}
        onRun={handleRun}
        costTooltip={costTooltip}
        accentColor="amber"
      />

    </div>
  );
}
