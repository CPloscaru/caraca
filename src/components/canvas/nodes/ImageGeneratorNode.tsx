'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, Position, useNodeId } from '@xyflow/react';
import { Sparkles, Play, Minus, Plus, Loader2 } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { ModelSelector } from './ModelSelector';
import { DebugToggleButton, JsonDebugPanel } from './JsonDebugPanel';
import { BatchCostDialog } from './BatchCostDialog';
import { CollapsibleSettings, SchemaFieldRenderer } from './schema-widgets';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ImageResultGrid } from './ImageResultGrid';
import type { ImageGeneratorData } from '@/types/canvas';
import { useFalNode } from '@/hooks/use-fal-node';
import type { ModelNodeConfig } from '@/lib/fal/schema-introspection';

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

const DEFAULT_IMAGE_CONFIG: ModelNodeConfig = {
  hasPrompt: true,
  hasImageUrl: true,
  hasLastFrame: false,
  hasSeed: true,
  hasDuration: false,
  hasAspectRatio: false,
  hasNumImages: true,
  hasGuidanceScale: false,
  hasNegativePrompt: false,
  hasImageSize: true,
};

const IMAGE_SIZE_LABELS: Record<string, string> = {
  'square_hd': '1:1 HD',
  'square': '1:1',
  'portrait_4_3': '3:4',
  'portrait_16_9': '9:16',
  'landscape_4_3': '4:3',
  'landscape_16_9': '16:9',
};

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
// ImageGeneratorNode
// ---------------------------------------------------------------------------

export function ImageGeneratorNode({ id, data, selected }: NodeProps) {
  const nodeId = useNodeId() ?? id;
  const nodeData = data as unknown as ImageGeneratorData;

  const {
    execState,
    isRunning,
    hasError,
    handleRun,
    config,
    schemaFields,
    extraFields,
    paramValues,
    setParam,
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
    upstreamBatch,
    isBatchConnected,
    edges,
  } = useFalNode({
    nodeId,
    nodeData: data as unknown as Record<string, unknown>,
    defaultModel: DEFAULT_MODEL,
    defaultConfig: DEFAULT_IMAGE_CONFIG,
    hasDynamicPorts: false,
    hasQueueStatus: false,
  });

  // ImageGen-specific: image input connected (for mode detection)
  const imageInputConnected = useMemo(
    () => edges.some((e) => e.target === nodeId && e.targetHandle === 'image-target-1'),
    [edges, nodeId],
  );

  // Auto-switch to image-to-image mode when image input is connected.
  const prevImageConnected = useRef(imageInputConnected);
  useEffect(() => {
    if (imageInputConnected && !prevImageConnected.current) {
      updateNodeData(nodeId, { mode: 'image-to-image' });
    }
    prevImageConnected.current = imageInputConnected;
  }, [imageInputConnected, nodeId, updateNodeData]);

  // Auto-disconnect image port when model doesn't support image_url
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const prevHasImageUrl = useRef(config.hasImageUrl);
  useEffect(() => {
    if (prevHasImageUrl.current && !config.hasImageUrl) {
      const edge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === 'image-target-1',
      );
      if (edge) deleteEdge(edge.id);
    }
    prevHasImageUrl.current = config.hasImageUrl;
  }, [config.hasImageUrl, edges, nodeId, deleteEdge]);

  // Find text source info for label/batch detection
  const nodes = useCanvasStore((s) => s.nodes);
  const textSourceInfo = useMemo(() => {
    if (!textInputConnected) return null;
    const edge = edges.find(
      (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
    );
    if (!edge) return null;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const sData = sourceNode?.data as Record<string, unknown> | undefined;
    return {
      label: (sData?.label as string) ?? 'Text Input',
      isBatch: sourceNode?.type === 'batchParameter',
      batchNodeId: sourceNode?.id ?? null,
      batchValues: ((sData?.values as string[]) ?? []),
    };
  }, [edges, nodeId, nodes, textInputConnected]);
  const textSourceLabel = textSourceInfo?.label ?? null;

  const handleSelectImage = useCallback(
    (index: number) => {
      updateNodeData(nodeId, { selectedImageIndex: index });
    },
    [nodeId, updateNodeData],
  );

  const prompt = nodeData.prompt ?? '';
  const aspectRatio = nodeData.aspectRatio ?? '1:1';
  const numImages = nodeData.numImages ?? 1;
  const images = nodeData.images ?? [];
  const selectedImageIndex = nodeData.selectedImageIndex ?? 0;
  const mode = nodeData.mode ?? 'text-to-image';

  return (
    <div
      className={`group relative rounded-lg border-2 bg-[#1a1a1a] shadow-lg transition-all ${statusBorder} ${
        selected ? 'ring-2 ring-[#ae53ba] ring-offset-1 ring-offset-transparent' : ''
      }`}
      style={{
        minWidth: 320,
        maxWidth: 400,
        borderLeftColor: config.hasImageUrl && imageInputConnected ? '#2a8af6' : undefined,
        borderLeftWidth: config.hasImageUrl && imageInputConnected ? 3 : undefined,
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
      {config.hasImageUrl && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="image"
          portId="image-in-0"
          index={1}
          style={{ top: '55%' }}
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
        <Sparkles className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-semibold text-gray-100">
          Image Generator
        </span>
        {config.hasImageUrl && imageInputConnected && (
          <span className="ml-auto rounded bg-[#2a8af6]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#2a8af6]">
            img2img
          </span>
        )}
      </div>

      {/* Result area */}
      <div className="relative px-3 py-2">
        <DebugToggleButton active={debugMode} onClick={() => setDebugMode((v) => !v)} />
        {debugMode ? (
          <JsonDebugPanel
            schema={schemaFields}
            config={{ model, prompt, aspectRatio, numImages, imageSizeOption: (nodeData as Record<string, unknown>).imageSizeOption }}
            request={nodeData.debugRequest}
            response={nodeData.debugResponse}
            error={nodeData.debugError}
          />
        ) : (
          <>
            {isRunning && <ShimmerPlaceholder aspectRatio={aspectRatio} />}
            {hasError && execState?.error && (
              <div className="rounded-md border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-400">
                {execState.error}
              </div>
            )}
            {!isRunning && images.length > 0 && (
              <ImageResultGrid
                images={images}
                selectedImageIndex={selectedImageIndex}
                onSelectImage={handleSelectImage}
              />
            )}
            {!isRunning && images.length === 0 && !hasError && (
              <ShimmerPlaceholder aspectRatio={aspectRatio} />
            )}
          </>
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
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Model
          </label>
          <ModelSelector
            value={model}
            onChange={(v) => updateData('model', v)}
            mode={mode === 'image-to-image' ? 'image-to-image' : 'text-to-image'}
            onPricingInfo={(info) => updateNodeData(nodeId, { unitPrice: info.unitPrice, priceUnit: info.priceUnit })}
          />
        </div>

        {/* Aspect ratio + count */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Aspect
            </label>
            <div className="flex flex-wrap gap-0.5">
              {config.hasImageSize && config.imageSizeOptions && config.imageSizeOptions.length > 0 ? (
                config.imageSizeOptions.map((option) => (
                  <button
                    key={option}
                    className={`nodrag rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      nodeData.imageSizeOption === option
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                    }`}
                    onClick={() => {
                      updateData('imageSizeOption', option);
                      updateData('aspectRatio', IMAGE_SIZE_LABELS[option] ?? option);
                    }}
                    title={option}
                  >
                    {IMAGE_SIZE_LABELS[option] ?? option}
                  </button>
                ))
              ) : (
                Object.entries(ASPECT_RATIO_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    className={`nodrag rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      aspectRatio === key
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                    }`}
                    onClick={() => {
                      updateData('aspectRatio', key);
                      updateData('imageSizeOption', undefined);
                    }}
                    title={`${preset.width}x${preset.height}`}
                  >
                    {preset.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {config.hasNumImages && (
            <div className={isBatchConnected ? 'opacity-40' : ''}>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Count{isBatchConnected ? ' (batch)' : ''}
              </label>
              <div className="flex items-center gap-1">
                <button
                  className="nodrag rounded bg-white/5 p-0.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                  onClick={() =>
                    updateData('numImages', Math.max(1, numImages - 1))
                  }
                  disabled={numImages <= 1 || isBatchConnected}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-xs text-gray-300">
                  {isBatchConnected ? 1 : numImages}
                </span>
                <button
                  className="nodrag rounded bg-white/5 p-0.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                  onClick={() =>
                    updateData('numImages', Math.min(4, numImages + 1))
                  }
                  disabled={numImages >= 4 || isBatchConnected}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic schema params */}
      {extraFields.length > 0 && (
        <CollapsibleSettings>
          {extraFields.map((field) => (
            <SchemaFieldRenderer
              key={field.name}
              field={field}
              value={paramValues[field.name]}
              onChange={(v) => setParam(field.name, v)}
            />
          ))}
        </CollapsibleSettings>
      )}

      {/* Batch cost dialog */}
      <BatchCostDialog
        open={costDialogOpen}
        onConfirm={handleCostConfirm}
        onCancel={() => setCostDialogOpen(false)}
        itemCount={upstreamBatch?.values.length ?? 0}
        unitPrice={(nodeData as Record<string, unknown>).unitPrice as number | null ?? null}
        priceUnit={(nodeData as Record<string, unknown>).priceUnit as string | null ?? null}
        modelName={model}
      />

      {/* Run button */}
      <div className="flex justify-end p-2 pt-0">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="nodrag flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-all hover:bg-purple-500"
                onClick={handleRun}
                title={isRunning ? 'Cancel' : undefined}
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            {costTooltip && !isRunning && (
              <TooltipContent>~{costTooltip}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

    </div>
  );
}

