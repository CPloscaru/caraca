'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEdges } from '@xyflow/react';
import { useExecutionStore } from '@/stores/execution-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { runSingleNode, runBatchNode } from '@/lib/executors';
import { isCostDialogDismissed } from '@/components/canvas/nodes/BatchCostDialog';
import { formatFalPrice } from '@/components/canvas/nodes/ModelSelector';
import { getStatusBorderClass } from '@/components/canvas/nodes/node-utils';
import {
  fetchModelSchema,
  fetchSchemaTree,
  deriveNodeConfig,
  getSchemaImageFields,
  type ModelNodeConfig,
  type ModelInputField,
  type DynamicImagePort,
} from '@/lib/fal/schema-introspection';
import { useSchemaParams } from '@/lib/fal/use-schema-params';
import type { SchemaNode } from '@/lib/fal/schema-tree';
import { computePerElementPorts } from '@/lib/fal/schema-ports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseFalNodeOptions {
  nodeId: string;
  nodeData: Record<string, unknown>;
  defaultModel: string;
  defaultConfig: ModelNodeConfig;
  excludeParams?: Set<string>;
  /** Enable dynamic image port management (T2V/I2V: true, ImageGen: false). */
  hasDynamicPorts?: boolean;
  /** Enable isPending state for queue-based models (T2V/I2V: true, ImageGen: false). */
  hasQueueStatus?: boolean;
  /** Data to clear before a single run (video nodes clear videoUrl/cdnUrl/videoResults). */
  clearBeforeRun?: Record<string, unknown>;
}

export interface UseFalNodeReturn {
  // Execution
  execState: { status: string; error?: string; result?: Record<string, unknown> } | undefined;
  isRunning: boolean;
  isPending: boolean;
  hasError: boolean;
  handleRun: () => void;
  // Schema
  config: ModelNodeConfig;
  schemaFields: ModelInputField[] | null;
  dynamicImagePorts: DynamicImagePort[];
  setDynamicImagePorts: React.Dispatch<React.SetStateAction<DynamicImagePort[]>>;
  schemaTree: SchemaNode[];
  paramValues: Record<string, unknown>;
  setParam: (key: string, value: unknown) => void;
  filteredTree: SchemaNode[];
  extraFields: ModelInputField[];
  // UI state
  debugMode: boolean;
  setDebugMode: React.Dispatch<React.SetStateAction<boolean>>;
  costDialogOpen: boolean;
  setCostDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleCostConfirm: () => void;
  // Derived
  model: string;
  statusBorder: string;
  costTooltip: string | null;
  textInputConnected: boolean;
  updateData: (field: string, value: unknown) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  handleModelChange: (newModel: string) => void;
  // Batch
  upstreamBatch: { id: string; values: string[] } | null;
  isBatchConnected: boolean;
  // Edges (for component-level use)
  edges: ReturnType<typeof useEdges>;
  // Port tracking ref (video nodes need this for per-element port recomputation)
  prevPortKeyRef: React.MutableRefObject<string>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFalNode(options: UseFalNodeOptions): UseFalNodeReturn {
  const {
    nodeId,
    nodeData,
    defaultModel,
    defaultConfig,
    excludeParams,
    hasDynamicPorts = false,
    hasQueueStatus = false,
    clearBeforeRun,
  } = options;

  // ---- Execution state ----
  const execState = useExecutionStore((s) => s.nodeStates[nodeId]);
  const isRunning = execState?.status === 'running';
  const isPending = hasQueueStatus ? execState?.status === 'pending' : false;
  const hasError = execState?.status === 'error';

  // ---- Canvas store ----
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useEdges();

  // ---- Derived data ----
  const model = (nodeData.model as string) ?? defaultModel;

  // ---- Pricing ----
  const unitPrice = (nodeData.unitPrice as number | null) ?? null;
  const priceUnit = (nodeData.priceUnit as string | null) ?? null;
  const costTooltip = formatFalPrice(unitPrice, priceUnit);

  // ---- Status border ----
  const statusBorder = getStatusBorderClass(execState?.status);

  // ---- Text input connected ----
  const textInputConnected = useMemo(
    () => edges.some((e) => e.target === nodeId && e.targetHandle === 'text-target-0'),
    [edges, nodeId],
  );

  // ---- Upstream batch detection ----
  const upstreamBatch = useMemo(() => {
    const inEdge = edges.find((e) => e.target === nodeId);
    if (!inEdge) return null;
    const sourceNode = nodes.find((n) => n.id === inEdge.source);
    if (!sourceNode || sourceNode.type !== 'batchParameter') return null;
    return {
      id: sourceNode.id,
      values: ((sourceNode.data as Record<string, unknown>).values as string[]) ?? [],
    };
  }, [edges, nodeId, nodes]);

  const isBatchConnected = upstreamBatch != null && upstreamBatch.values.length > 0;

  // ---- Cost dialog state ----
  const [costDialogOpen, setCostDialogOpen] = useState(false);

  const handleRun = useCallback(() => {
    if (isRunning || isPending) {
      useExecutionStore.getState().cancelExecution(nodeId);
      return;
    }
    if (upstreamBatch && upstreamBatch.values.length > 0) {
      if (isCostDialogDismissed()) {
        runBatchNode(upstreamBatch.id).catch(console.error);
      } else {
        setCostDialogOpen(true);
      }
    } else {
      if (clearBeforeRun) {
        updateNodeData(nodeId, clearBeforeRun);
      }
      runSingleNode(nodeId).catch(console.error);
    }
  }, [nodeId, upstreamBatch, isRunning, isPending, updateNodeData, clearBeforeRun]);

  const handleCostConfirm = useCallback(() => {
    setCostDialogOpen(false);
    if (upstreamBatch) {
      runBatchNode(upstreamBatch.id).catch(console.error);
    }
  }, [upstreamBatch]);

  // ---- Schema-driven config ----
  const [config, setConfig] = useState<ModelNodeConfig>(defaultConfig);
  const [schemaFields, setSchemaFields] = useState<ModelInputField[] | null>(null);
  const [dynamicImagePorts, setDynamicImagePorts] = useState<DynamicImagePort[]>([]);
  const [schemaTree, setSchemaTree] = useState<SchemaNode[]>([]);

  // ---- Debug mode ----
  const [debugMode, setDebugMode] = useState(false);

  // ---- Track previous port states for auto-disconnect ----
  const prevHasPrompt = useRef(config.hasPrompt);
  const prevDynamicPortFields = useRef<Set<string>>(new Set());

  // ---- Fetch schema on model change ----
  useEffect(() => {
    if (!model) return;          // skip fetch for empty/unset model
    let cancelled = false;

    if (hasDynamicPorts) {
      // Video nodes: fetch both schema and tree
      Promise.all([fetchModelSchema(model), fetchSchemaTree(model)]).then(([fields, tree]) => {
        if (cancelled) return;
        setSchemaTree(tree);
        setSchemaFields(fields.length > 0 ? fields : null);
        if (fields.length > 0) {
          setConfig(deriveNodeConfig(fields));
          const imagePorts = getSchemaImageFields(fields, tree);
          setDynamicImagePorts(imagePorts);
          updateNodeData(nodeId, {
            dynamicImagePorts: imagePorts.map((p) => ({
              fieldName: p.fieldName,
              multi: p.multi,
              maxConnections: p.maxConnections,
            })),
          });
        } else {
          setConfig(defaultConfig);
          setDynamicImagePorts([]);
          updateNodeData(nodeId, { dynamicImagePorts: undefined });
        }
      });
    } else {
      // ImageGen: only schema, no tree/dynamic ports
      fetchModelSchema(model).then((fields) => {
        if (cancelled) return;
        setSchemaFields(fields.length > 0 ? fields : null);
        if (fields.length > 0) {
          setConfig(deriveNodeConfig(fields));
        } else {
          setConfig(defaultConfig);
        }
      });
    }

    return () => { cancelled = true; };
  }, [model, nodeId, updateNodeData, hasDynamicPorts, defaultConfig]);

  // ---- Auto-disconnect prompt edge when model no longer supports prompt ----
  useEffect(() => {
    if (prevHasPrompt.current && !config.hasPrompt) {
      const promptEdge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === 'text-target-0',
      );
      if (promptEdge) {
        deleteEdge(promptEdge.id);
      }
    }
    prevHasPrompt.current = config.hasPrompt;
  }, [config.hasPrompt, edges, nodeId, deleteEdge]);

  // ---- Auto-disconnect stale dynamic image port edges on model change ----
  useEffect(() => {
    if (!hasDynamicPorts) return;

    const newFieldNames = new Set(dynamicImagePorts.map((p) => p.fieldName));

    for (const oldField of prevDynamicPortFields.current) {
      if (!newFieldNames.has(oldField)) {
        const handleId = `image-target-${oldField}`;
        const staleEdge = edges.find(
          (e) => e.target === nodeId && e.targetHandle === handleId,
        );
        if (staleEdge) {
          deleteEdge(staleEdge.id);
        }
      }
    }

    prevDynamicPortFields.current = newFieldNames;
  }, [dynamicImagePorts, edges, nodeId, deleteEdge, hasDynamicPorts]);

  // ---- Recompute per-element ports (video nodes only) ----
  const prevPortKeyRef = useRef('');
  useEffect(() => {
    if (!hasDynamicPorts || schemaTree.length === 0) return;

    const schemaParams = nodeData.schemaParams as Record<string, unknown> | undefined;
    const counts: Record<string, number> = {};
    for (const n of schemaTree) {
      if (n.kind === 'array' && n.itemSchema?.kind === 'object' && n.itemSchema.children) {
        const arr = schemaParams?.[n.path];
        counts[n.path] = Array.isArray(arr) ? Math.max(arr.length, 1) : 1;
      }
    }

    const topPorts = dynamicImagePorts.filter((p) => !p.fieldName.includes('.'));
    const perElemPorts = computePerElementPorts(schemaTree, counts);
    const allPorts = [...topPorts, ...perElemPorts];

    const portKey = allPorts.map((p) => p.fieldName).join(',');
    if (portKey === prevPortKeyRef.current) return;
    prevPortKeyRef.current = portKey;

    setDynamicImagePorts(allPorts);
    updateNodeData(nodeId, {
      dynamicImagePorts: allPorts.map((p) => ({
        fieldName: p.fieldName,
        multi: p.multi,
        maxConnections: p.maxConnections,
      })),
    });
  }, [schemaTree, nodeData.schemaParams, nodeId, dynamicImagePorts, updateNodeData, hasDynamicPorts]);

  // ---- Update helpers ----
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

  // ---- Schema params ----
  const { extraFields, paramValues, setParam, filteredTree } = useSchemaParams(
    nodeId, model, nodeData.schemaParams as Record<string, unknown> | undefined, updateNodeData, excludeParams,
  );

  return {
    execState,
    isRunning,
    isPending,
    hasError,
    handleRun,
    config,
    schemaFields,
    dynamicImagePorts,
    setDynamicImagePorts,
    schemaTree,
    paramValues,
    setParam,
    filteredTree,
    extraFields,
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
    isBatchConnected,
    edges,
    prevPortKeyRef,
  };
}
