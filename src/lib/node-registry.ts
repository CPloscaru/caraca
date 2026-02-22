/**
 * Centralized node registry — single source of truth for all node type metadata.
 *
 * Declares resultFields, stripOnExport, ports, label, tags, and order for
 * every node type (existing + future). Executor dispatch uses applyNodeResult()
 * to generically map internal result keys to canvas store fields.
 */

import type { PortType } from '@/lib/port-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortDefinition = {
  id: string;
  type: PortType;
  label: string;
};

export type NodeRegistryEntry = {
  type: string;
  label: string;
  description: string;
  tags: string[];
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  /** Maps internal result keys (e.g. __images) to canvas node data fields (e.g. images) */
  resultFields: Record<string, string>;
  /** Fields to strip when exporting workflow JSON */
  stripOnExport: string[];
  /** Display order in sidebar/palette */
  order: number;
  /** Optional key into executors map — if absent, type is used */
  executeHandler?: string;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const NODE_REGISTRY_ARRAY = [
  // -- Existing nodes --
  {
    type: 'textInput',
    label: 'Text Input',
    description: 'Freeform text input',
    tags: ['text', 'input', 'prompt'],
    inputs: [],
    outputs: [{ id: 'text-source-0', type: 'text' as const, label: 'Text' }],
    resultFields: {},
    stripOnExport: [],
    order: 10,
  },
  {
    type: 'imageImport',
    label: 'Image Import',
    description: 'Upload or drop an image',
    tags: ['image', 'upload', 'import'],
    inputs: [],
    outputs: [{ id: 'image-source-0', type: 'image' as const, label: 'Image' }],
    resultFields: {},
    stripOnExport: [],
    order: 20,
  },
  {
    type: 'imageGenerator',
    label: 'Image Generator',
    description: 'Generate images with AI',
    tags: ['image', 'generate', 'ai', 'fal'],
    inputs: [
      { id: 'text-target-0', type: 'text' as const, label: 'Prompt' },
      { id: 'image-target-1', type: 'image' as const, label: 'Reference' },
    ],
    outputs: [{ id: 'image-source-0', type: 'image' as const, label: 'Output' }],
    resultFields: { __images: 'images' },
    stripOnExport: ['images'],
    order: 30,
  },
  {
    type: 'llmAssistant',
    label: 'LLM Assistant',
    description: 'Enrich prompts with LLM',
    tags: ['llm', 'text', 'ai', 'prompt', 'assistant'],
    inputs: [{ id: 'image-target-0', type: 'image' as const, label: 'Image' }],
    outputs: [{ id: 'text-source-0', type: 'text' as const, label: 'Response' }],
    resultFields: { __llmOutput: 'output', __tokenUsage: 'tokenUsage' },
    stripOnExport: ['output', 'tokenUsage'],
    order: 40,
  },
  {
    type: 'placeholder',
    label: 'Placeholder',
    description: 'Placeholder node for future types',
    tags: ['placeholder'],
    inputs: [],
    outputs: [],
    resultFields: {},
    stripOnExport: [],
    order: 999,
  },

  // -- Future nodes (Phase 12-14 placeholders) --
  {
    type: 'imageUpscale',
    label: 'Image Upscale',
    description: 'Upscale images with AI',
    tags: ['image', 'upscale', 'ai', 'fal'],
    inputs: [{ id: 'image-target-0', type: 'image' as const, label: 'Image' }],
    outputs: [{ id: 'image-source-0', type: 'image' as const, label: 'Output' }],
    resultFields: { __outputImage: 'outputImage' },
    stripOnExport: ['outputImage'],
    order: 50,
  },
  {
    type: 'textToVideo',
    label: 'Text to Video',
    description: 'Generate video from text prompt',
    tags: ['video', 'generate', 'ai', 'fal'],
    inputs: [{ id: 'text-target-0', type: 'text' as const, label: 'Prompt' }],
    outputs: [{ id: 'video-source-0', type: 'video' as const, label: 'Video' }],
    resultFields: { __videoUrl: 'videoUrl' },
    stripOnExport: ['videoUrl'],
    order: 60,
  },
  {
    type: 'imageToVideo',
    label: 'Image to Video',
    description: 'Generate video from image',
    tags: ['video', 'generate', 'ai', 'fal'],
    inputs: [
      { id: 'image-target-0', type: 'image' as const, label: 'Image' },
      { id: 'text-target-0', type: 'text' as const, label: 'Prompt' },
    ],
    outputs: [{ id: 'video-source-0', type: 'video' as const, label: 'Video' }],
    resultFields: { __videoUrl: 'videoUrl' },
    stripOnExport: ['videoUrl'],
    order: 70,
  },
  {
    type: 'batchParameter',
    label: 'Batch Parameter',
    description: 'Run workflows with parameter variations',
    tags: ['batch', 'parameter', 'automation'],
    inputs: [],
    outputs: [{ id: 'text-source-0', type: 'text' as const, label: 'Value' }],
    resultFields: { __batchResults: 'batchResults' },
    stripOnExport: ['batchResults'],
    order: 80,
  },
] as const satisfies readonly NodeRegistryEntry[];

export const NODE_REGISTRY: readonly NodeRegistryEntry[] = NODE_REGISTRY_ARRAY;

// ---------------------------------------------------------------------------
// Lookup index (built once)
// ---------------------------------------------------------------------------

const registryMap = new Map<string, NodeRegistryEntry>();
for (const entry of NODE_REGISTRY) {
  registryMap.set(entry.type, entry);
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Get a single registry entry by node type, or undefined if not found. */
export function getRegistryEntry(type: string): NodeRegistryEntry | undefined {
  return registryMap.get(type);
}

/** Get all registry entries. */
export function getRegistryEntries(): readonly NodeRegistryEntry[] {
  return NODE_REGISTRY;
}

/** Get the set of all known node type strings. */
export function getKnownNodeTypes(): Set<string> {
  return new Set(registryMap.keys());
}

/** Get the set of all fields that should be stripped on export across all node types. */
export function getStripFields(): Set<string> {
  // Universal strip fields (UI state that should never be exported)
  const fields = new Set<string>(['outputExpanded']);
  for (const entry of NODE_REGISTRY) {
    for (const field of entry.stripOnExport) {
      fields.add(field);
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// applyNodeResult — generic result dispatch
// ---------------------------------------------------------------------------

/**
 * Applies executor result to canvas node data via the registry's resultFields mapping.
 * Strips internal fields (prefixed with __) before returning clean result for downstream.
 *
 * @param nodeType - The node type string
 * @param nodeId - The node instance ID
 * @param result - Raw executor result (may contain __ prefixed internal fields)
 * @param updateNodeData - Callback to update canvas store node data (framework-agnostic)
 * @returns Clean result with internal fields stripped, suitable for downstream nodes
 */
export function applyNodeResult(
  nodeType: string,
  nodeId: string,
  result: Record<string, unknown>,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
): Record<string, unknown> {
  const entry = getRegistryEntry(nodeType);
  if (!entry) {
    console.error(`Unknown node type in applyNodeResult: ${nodeType}`);
    // Return result with internal fields stripped
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(result)) {
      if (!k.startsWith('__')) clean[k] = v;
    }
    return clean;
  }

  // Write mapped result fields to canvas store
  const updates: Record<string, unknown> = {};
  for (const [resultKey, dataKey] of Object.entries(entry.resultFields)) {
    if (resultKey in result) {
      updates[dataKey] = result[resultKey];
    }
  }
  if (Object.keys(updates).length > 0) {
    updateNodeData(nodeId, updates);
  }

  // Strip internal fields (those starting with __) before downstream
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result)) {
    if (!k.startsWith('__')) clean[k] = v;
  }
  return clean;
}
