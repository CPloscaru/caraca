'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges, useNodeConnections, useNodeId } from '@xyflow/react';
import { Video, Play, Loader2 } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode, runBatchNode } from '@/lib/executors';
import { ModelSelector, formatFalPrice } from './ModelSelector';
import { BatchCostDialog, isCostDialogDismissed } from './BatchCostDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VideoResult, GenerationProgress } from './VideoPlayer';
import { VideoResultCarousel } from './VideoResultCarousel';
import { getStatusBorderClass, ShimmerPlaceholder } from './node-utils';
import {
  fetchModelSchema,
  deriveNodeConfig,
  getSchemaImageFields,
  type ModelNodeConfig,
  type ModelInputField,
  type DynamicImagePort,
} from '@/lib/fal/schema-introspection';
import { DebugToggleButton, JsonDebugPanel } from './JsonDebugPanel';
import { CollapsibleSettings, SchemaFieldRenderer } from './schema-widgets';
import { useSchemaParams } from '@/lib/fal/use-schema-params';
import type { ImageToVideoData } from '@/types/canvas';

const I2V_EXCLUDE = new Set(['seed']);

// ---------------------------------------------------------------------------
// Default config (fallback before schema introspection runs)
// ---------------------------------------------------------------------------

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
// Dynamic image port helpers
// ---------------------------------------------------------------------------

function buildPortTooltip(port: DynamicImagePort, connectionCount: number): string {
  const parts: string[] = [];
  if (port.description) parts.push(port.description);
  parts.push(port.required ? 'Required' : 'Optional');
  parts.push(port.multi ? `Multi (${connectionCount}/${port.maxConnections})` : 'Single image');
  return parts.join('. ') + '.';
}

function DynamicImageHandle({
  port,
  handleId,
}: {
  port: DynamicImagePort;
  handleId: string;
}) {
  const connections = useNodeConnections({ handleType: 'target', handleId });
  const connected = connections.length > 0;

  return (
    <div className="relative flex items-center rounded-md border border-white/10 bg-white/5 px-3 py-1.5">
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="image"
        portId={handleId}
        handleId={handleId}
        index={0}
        required={port.required && !connected}
        isConnectable={port.maxConnections}
        tooltip={buildPortTooltip(port, connections.length)}
        style={{ left: -24 }}
      />
      <span className="text-xs text-gray-400">
        {connected ? `${port.label} ✓` : port.label}
      </span>
      {port.multi && (
        <span className="ml-auto text-[9px] text-gray-500">
          {connections.length}/{port.maxConnections}
        </span>
      )}
    </div>
  );
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

  // Canvas store
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useEdges();

  // Derived data
  const model = nodeData.model ?? DEFAULT_MODEL;
  const aspectRatio = nodeData.aspectRatio ?? '16:9';
  const duration = nodeData.duration ?? 5;
  const seed = nodeData.seed ?? null;
  const videoUrl = nodeData.videoUrl ?? null;
  const cdnUrl = nodeData.cdnUrl ?? null;
  const videoResults = nodeData.videoResults ?? null;

  // Pricing info from ModelSelector
  const unitPrice = (nodeData as Record<string, unknown>).unitPrice as number | null ?? null;
  const priceUnit = (nodeData as Record<string, unknown>).priceUnit as string | null ?? null;
  const costTooltip = formatFalPrice(unitPrice, priceUnit);

  const statusBorder = getStatusBorderClass(execState?.status);

  // Upstream batch detection
  const upstreamBatch = useMemo(() => {
    const inEdge = edges.find((e) => e.target === nodeId);
    if (!inEdge) return null;
    const sourceNode = nodes.find((n) => n.id === inEdge.source);
    if (!sourceNode || sourceNode.type !== 'batchParameter') return null;
    return { id: sourceNode.id, values: ((sourceNode.data as Record<string, unknown>).values as string[]) ?? [] };
  }, [edges, nodeId, nodes]);

  // Cost dialog state
  const [costDialogOpen, setCostDialogOpen] = useState(false);

  const handleRun = useCallback(() => {
    if (isRunning || isPending) {
      useExecutionStore.getState().cancelExecution();
      return;
    }
    if (upstreamBatch && upstreamBatch.values.length > 0) {
      if (isCostDialogDismissed()) {
        runBatchNode(upstreamBatch.id).catch(console.error);
      } else {
        setCostDialogOpen(true);
      }
    } else {
      updateNodeData(nodeId, { videoUrl: null, cdnUrl: null, videoResults: null });
      runSingleNode(nodeId).catch(console.error);
    }
  }, [nodeId, upstreamBatch, isRunning, isPending, updateNodeData]);

  const handleCostConfirm = useCallback(() => {
    setCostDialogOpen(false);
    if (upstreamBatch) {
      runBatchNode(upstreamBatch.id).catch(console.error);
    }
  }, [upstreamBatch]);

  // Schema-driven config
  const [config, setConfig] = useState<ModelNodeConfig>(DEFAULT_CONFIG);
  const [schemaFields, setSchemaFields] = useState<ModelInputField[] | null>(null);
  const [dynamicImagePorts, setDynamicImagePorts] = useState<DynamicImagePort[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Debug mode (per-session, not persisted)
  const [debugMode, setDebugMode] = useState(false);

  // Track previous port states to auto-disconnect edges on model change
  const prevHasPrompt = useRef(config.hasPrompt);
  const prevDynamicPortFields = useRef<Set<string>>(new Set());

  // Fetch schema on model change
  useEffect(() => {
    let cancelled = false;
    setSchemaLoading(true);
    fetchModelSchema(model).then((fields) => {
      if (cancelled) return;
      setSchemaLoading(false);
      setSchemaFields(fields.length > 0 ? fields : null);
      if (fields.length > 0) {
        setConfig(deriveNodeConfig(fields));
        const imagePorts = getSchemaImageFields(fields);
        setDynamicImagePorts(imagePorts);
        // Store port config on node data for the executor
        updateNodeData(nodeId, {
          dynamicImagePorts: imagePorts.map(p => ({
            fieldName: p.fieldName,
            multi: p.multi,
            maxConnections: p.maxConnections,
          })),
        });
      } else {
        setConfig(DEFAULT_CONFIG);
        setDynamicImagePorts([]);
        updateNodeData(nodeId, { dynamicImagePorts: undefined });
      }
    });
    return () => { cancelled = true; };
  }, [model, nodeId, updateNodeData]);

  // Auto-disconnect prompt edge when model no longer supports prompt
  useEffect(() => {
    if (prevHasPrompt.current && !config.hasPrompt) {
      const promptEdge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
      );
      if (promptEdge) {
        deleteEdge(promptEdge.id);
        console.warn(
          `[ImageToVideo] Auto-disconnected prompt wire - model "${model}" does not support prompts`,
        );
      }
    }
    prevHasPrompt.current = config.hasPrompt;
  }, [config.hasPrompt, edges, nodeId, model, deleteEdge]);

  // Auto-disconnect stale dynamic image port edges on model change
  useEffect(() => {
    const newFieldNames = new Set(dynamicImagePorts.map(p => p.fieldName));

    // Disconnect edges for ports that no longer exist
    for (const oldField of prevDynamicPortFields.current) {
      if (!newFieldNames.has(oldField)) {
        const handleId = `image-target-${oldField}`;
        const staleEdge = edges.find(
          e => e.target === nodeId && e.targetHandle === handleId,
        );
        if (staleEdge) {
          deleteEdge(staleEdge.id);
        }
      }
    }

    // Also disconnect edges to old static handle IDs if they exist (migration from pre-Phase-25)
    for (const oldStaticId of ['image-target-0', 'image-target-1']) {
      const staleEdge = edges.find(
        e => e.target === nodeId && e.targetHandle === oldStaticId,
      );
      if (staleEdge) {
        deleteEdge(staleEdge.id);
      }
    }

    prevDynamicPortFields.current = newFieldNames;
  }, [dynamicImagePorts, edges, nodeId, deleteEdge]);

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

  // Schema-driven extra params
  const { extraFields, paramValues, setParam } = useSchemaParams(
    nodeId, model, nodeData.schemaParams, updateNodeData, I2V_EXCLUDE,
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
      {/* Text prompt input handle — positioned at container level */}
      {config.hasPrompt && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="text"
          portId="text-in-0"
          index={0}
          style={{ top: '45%' }}
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
      <div className="relative px-3 py-2">
        <DebugToggleButton active={debugMode} onClick={() => setDebugMode((v) => !v)} />
        {debugMode ? (
          <JsonDebugPanel
            schema={schemaFields}
            config={{ model, prompt: nodeData.prompt, aspectRatio, duration, seed }}
            request={nodeData.debugRequest}
            response={nodeData.debugResponse}
            error={nodeData.debugError}
          />
        ) : (
          <>
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
            {!isRunning && !isPending && videoResults && videoResults.length > 1 && (
              <VideoResultCarousel videos={videoResults} />
            )}
            {!isRunning && !isPending && !(videoResults && videoResults.length > 1) && videoUrl && (
              <VideoResult videoUrl={videoUrl} cdnUrl={cdnUrl} nodeId={nodeId} />
            )}

            {/* Idle state: shimmer placeholder */}
            {!isRunning && !isPending && !videoUrl && !hasError && (
              <ShimmerPlaceholder />
            )}
          </>
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
            mode="image-to-video"
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

        {/* Dynamic image ports */}
        {schemaLoading ? (
          <div className="mb-2 space-y-1">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Image Inputs
            </label>
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
              <span className="text-xs text-gray-500">Loading ports...</span>
            </div>
          </div>
        ) : dynamicImagePorts.length > 0 ? (
          <div className="mb-2 space-y-1">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Image Inputs
            </label>
            {dynamicImagePorts.map((port) => {
              const handleId = `image-target-${port.fieldName}`;
              return (
                <DynamicImageHandle
                  key={handleId}
                  port={port}
                  handleId={handleId}
                />
              );
            })}
          </div>
        ) : null}

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
                className="nodrag flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg transition-all hover:bg-amber-500"
                onClick={handleRun}
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
