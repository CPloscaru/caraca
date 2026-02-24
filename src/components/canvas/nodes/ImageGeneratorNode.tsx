'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeId } from '@xyflow/react';
import { Sparkles, Play, Minus, Plus, Loader2 } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode, runBatchNode } from '@/lib/executors';
import { fetchModelSchema, deriveNodeConfig, type ModelNodeConfig, type ModelInputField } from '@/lib/fal/schema-introspection';
import { ModelSelector, formatFalPrice } from './ModelSelector';
import { DebugToggleButton, JsonDebugPanel } from './JsonDebugPanel';
import { BatchCostDialog, isCostDialogDismissed } from './BatchCostDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ImageResultGrid } from './ImageResultGrid';
import { getStatusBorderClass } from './node-utils';
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

  // Execution state
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);
  const isRunning = execState?.status === 'running';
  const hasError = execState?.status === 'error';
  const isDone = execState?.status === 'done';

  // Canvas store for updating node data
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);

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

  // Extract model early — needed for schema fetch below
  const model = nodeData.model ?? DEFAULT_MODEL;

  // Schema-driven config state
  const [config, setConfig] = useState<ModelNodeConfig>(DEFAULT_IMAGE_CONFIG);
  const [schemaFields, setSchemaFields] = useState<ModelInputField[] | null>(null);

  // Debug mode (per-session, not persisted)
  const [debugMode, setDebugMode] = useState(false);

  // Fetch model schema on model change (cancelled-fetch pattern for rapid switching)
  useEffect(() => {
    let cancelled = false;
    fetchModelSchema(model).then((fields) => {
      if (cancelled) return;
      setSchemaFields(fields.length > 0 ? fields : null);
      if (fields.length > 0) {
        setConfig(deriveNodeConfig(fields));
      } else {
        setConfig(DEFAULT_IMAGE_CONFIG);
      }
    });
    return () => { cancelled = true; };
  }, [model]);

  // Auto-disconnect image port when model doesn't support image_url
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

  // Find the source node label and type for the text connection
  const textSourceInfo = useMemo(() => {
    if (!textInputConnected) return null;
    const edge = edges.find(
      (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
    );
    if (!edge) return null;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const data = sourceNode?.data as Record<string, unknown> | undefined;
    return {
      label: (data?.label as string) ?? 'Text Input',
      isBatch: sourceNode?.type === 'batchParameter',
      batchNodeId: sourceNode?.id ?? null,
      batchValues: ((data?.values as string[]) ?? []),
    };
  }, [edges, nodeId, nodes, textInputConnected]);
  const textSourceLabel = textSourceInfo?.label ?? null;
  const isBatchConnected = textSourceInfo?.isBatch ?? false;

  // Cost dialog state
  const [costDialogOpen, setCostDialogOpen] = useState(false);

  const handleRun = useCallback(() => {
    if (isRunning) {
      useExecutionStore.getState().cancelExecution();
      return;
    }
    if (isBatchConnected && textSourceInfo?.batchNodeId && textSourceInfo.batchValues.length > 0) {
      if (isCostDialogDismissed()) {
        runBatchNode(textSourceInfo.batchNodeId).catch(console.error);
      } else {
        setCostDialogOpen(true);
      }
    } else {
      runSingleNode(nodeId).catch(console.error);
    }
  }, [nodeId, isRunning, isBatchConnected, textSourceInfo]);

  const handleCostConfirm = useCallback(() => {
    setCostDialogOpen(false);
    if (textSourceInfo?.batchNodeId) {
      runBatchNode(textSourceInfo.batchNodeId).catch(console.error);
    }
  }, [textSourceInfo]);

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
  const aspectRatio = nodeData.aspectRatio ?? '1:1';
  const numImages = nodeData.numImages ?? 1;
  const images = nodeData.images ?? [];
  const selectedImageIndex = nodeData.selectedImageIndex ?? 0;
  const mode = nodeData.mode ?? 'text-to-image';

  // Pricing info from ModelSelector
  const unitPrice = (nodeData as Record<string, unknown>).unitPrice as number | null ?? null;
  const priceUnit = (nodeData as Record<string, unknown>).priceUnit as string | null ?? null;
  const costTooltip = formatFalPrice(unitPrice, priceUnit);

  const statusBorder = getStatusBorderClass(execState?.status);

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

      {/* Result area — directly after header */}
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
            {/* Running state: shimmer */}
            {isRunning && <ShimmerPlaceholder aspectRatio={aspectRatio} />}

            {/* Error state: red inline message */}
            {hasError && execState?.error && (
              <div className="rounded-md border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-400">
                {execState.error}
              </div>
            )}

            {/* Done state: image grid (also shown after refresh when data persists) */}
            {!isRunning && images.length > 0 && (
              <ImageResultGrid
                images={images}
                selectedImageIndex={selectedImageIndex}
                onSelectImage={handleSelectImage}
              />
            )}

            {/* Idle state: shimmer placeholder */}
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
        {/* Model selector */}
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
          {/* Aspect ratio — schema-driven options or fallback presets */}
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

          {/* Generation count — hidden when model doesn't support num_images, disabled when batch is connected */}
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

      {/* Batch cost dialog */}
      <BatchCostDialog
        open={costDialogOpen}
        onConfirm={handleCostConfirm}
        onCancel={() => setCostDialogOpen(false)}
        itemCount={textSourceInfo?.batchValues.length ?? 0}
        unitPrice={unitPrice}
        priceUnit={priceUnit}
        modelName={model}
      />

      {/* Run button — flow-based bottom-right */}
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
