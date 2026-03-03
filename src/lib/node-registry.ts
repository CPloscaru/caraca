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

export type NodeCategory = 'ai' | 'animation' | 'tools';

export type PortDefinition = {
  id: string;
  type: PortType;
  label: string;
};

type NodeRegistryEntry = {
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
  /** Whether this node type is available in the add-node menus (false = future/unimplemented) */
  available: boolean;
  /** Category for UI grouping (sidebar, context menu, command palette) */
  category: NodeCategory;
  /** Optional subcategory within a category (e.g. "Generators", "Effects" within Animation) */
  subcategory?: string;
};

/** Shape returned by getNodeTemplates() for UI consumers (CommandPalette, ContextMenu, Sidebar). */
export type NodeTemplate = {
  label: string;
  nodeType: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  description: string;
  tags: string[];
  category: NodeCategory;
  subcategory?: string;
};

/** Display labels for node categories */
export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  ai: 'AI',
  animation: 'Animation',
  tools: 'Outils',
};

/** Sort order for node categories */
export const CATEGORY_ORDER: Record<NodeCategory, number> = {
  ai: 1,
  animation: 2,
  tools: 3,
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
    available: true,
    category: 'ai',
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
    available: true,
    category: 'ai',
  },
  {
    type: 'imageGenerator',
    label: 'Image Generator',
    description: 'Generate images with AI',
    tags: ['image', 'generate', 'ai', 'fal'],
    inputs: [
      { id: 'text-target-0', type: 'text' as const, label: 'Prompt' },
      // image inputs are now dynamic -- not declared in registry
    ],
    outputs: [{ id: 'image-source-0', type: 'image' as const, label: 'Output' }],
    resultFields: { __images: 'images', __debugRequest: 'debugRequest', __debugResponse: 'debugResponse', __debugError: 'debugError' },
    stripOnExport: ['images', 'schemaParams', 'dynamicImagePorts', 'debugRequest', 'debugResponse', 'debugError'],
    order: 30,
    available: true,
    category: 'ai',
  },
  {
    type: 'llmAssistant',
    label: 'LLM Assistant',
    description: 'Enrich prompts with LLM',
    tags: ['llm', 'text', 'ai', 'prompt', 'assistant'],
    inputs: [
      // image inputs are now dynamic -- not declared in registry
    ],
    outputs: [{ id: 'text-source-0', type: 'text' as const, label: 'Response' }],
    resultFields: { __llmOutput: 'output', __tokenUsage: 'tokenUsage', __debugRequest: 'debugRequest', __debugResponse: 'debugResponse', __debugError: 'debugError' },
    stripOnExport: ['output', 'tokenUsage', 'debugRequest', 'debugResponse', 'debugError'],
    order: 40,
    available: true,
    category: 'ai',
  },
  {
    type: 'textDisplay',
    label: 'Text Display',
    description: 'Display text output with markdown rendering',
    tags: ['text', 'display', 'output', 'markdown'],
    inputs: [{ id: 'text-target-0', type: 'text' as const, label: 'Text' }],
    outputs: [],
    resultFields: { __displayText: 'displayText' },
    stripOnExport: ['displayText'],
    order: 45,
    available: true,
    category: 'ai',
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
    available: false,
    category: 'ai',
  },

  // -- Future nodes (Phase 12-14 placeholders) --
  {
    type: 'imageUpscale',
    label: 'Image Upscale',
    description: 'Upscale images with AI',
    tags: ['image', 'upscale', 'ai', 'fal'],
    inputs: [
      { id: 'image-target-0', type: 'image' as const, label: 'Image' },
      { id: 'text-target-0', type: 'text' as const, label: 'Prompt' },
    ],
    outputs: [{ id: 'image-source-0', type: 'image' as const, label: 'Output' }],
    resultFields: { __outputImage: 'outputImage', __inputImageUrl: 'inputImageUrl', __inputDimensions: 'inputDimensions', __debugRequest: 'debugRequest', __debugResponse: 'debugResponse', __debugError: 'debugError' },
    stripOnExport: ['outputImage', 'inputImageUrl', 'inputDimensions', 'schemaParams', 'debugRequest', 'debugResponse', 'debugError'],
    order: 50,
    available: true,
    category: 'ai',
  },
  {
    type: 'textToVideo',
    label: 'Text to Video',
    description: 'Generate video from text prompt',
    tags: ['video', 'generate', 'ai', 'fal'],
    inputs: [{ id: 'text-target-0', type: 'text' as const, label: 'Prompt' }],
    outputs: [{ id: 'video-source-0', type: 'video' as const, label: 'Video' }],
    resultFields: { __videoUrl: 'videoUrl', __cdnUrl: 'cdnUrl', __videoResults: 'videoResults', __debugRequest: 'debugRequest', __debugResponse: 'debugResponse', __debugError: 'debugError' },
    stripOnExport: ['videoUrl', 'cdnUrl', 'videoResults', 'schemaParams', 'dynamicImagePorts', 'debugRequest', 'debugResponse', 'debugError'],
    order: 60,
    available: true,
    category: 'ai',
  },
  {
    type: 'imageToVideo',
    label: 'Image to Video',
    description: 'Generate video from image',
    tags: ['video', 'generate', 'ai', 'fal'],
    inputs: [
      { id: 'text-target-0', type: 'text' as const, label: 'Prompt' },
      // image inputs are now dynamic — not declared in registry
    ],
    outputs: [{ id: 'video-source-0', type: 'video' as const, label: 'Video' }],
    resultFields: { __videoUrl: 'videoUrl', __cdnUrl: 'cdnUrl', __videoResults: 'videoResults', __debugRequest: 'debugRequest', __debugResponse: 'debugResponse', __debugError: 'debugError' },
    stripOnExport: ['videoUrl', 'cdnUrl', 'videoResults', 'schemaParams', 'dynamicImagePorts', 'debugRequest', 'debugResponse', 'debugError'],
    order: 70,
    available: true,
    category: 'ai',
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
    available: true,
    category: 'ai',
  },
  {
    type: 'gradientGenerator',
    label: 'Gradient Generator',
    description: 'Generate animated gradients (linear, radial, mesh)',
    tags: ['gradient', 'generator', 'webgl', 'animation'],
    inputs: [],
    outputs: [{ id: 'webgl-source-0', type: 'webgl' as const, label: 'Output' }],
    resultFields: {},
    stripOnExport: ['colorStops', 'gradientType', 'angle', 'speed', 'width', 'height'],
    order: 300,
    available: true,
    category: 'animation',
    subcategory: 'Generators',
  },
  {
    type: 'solidColor',
    label: 'Solid Color',
    description: 'Generate a solid color texture',
    tags: ['solid', 'color', 'webgl', 'animation'],
    inputs: [],
    outputs: [{ id: 'webgl-source-0', type: 'webgl' as const, label: 'Output' }],
    resultFields: {},
    stripOnExport: ['color', 'alpha'],
    order: 320,
    available: true,
    category: 'animation',
    subcategory: 'Generators',
  },
  {
    type: 'noiseGenerator',
    label: 'Noise Generator',
    description: 'Generate procedural noise textures',
    tags: ['noise', 'perlin', 'simplex', 'worley', 'cellular', 'webgl', 'animation'],
    inputs: [],
    outputs: [{ id: 'webgl-source-0', type: 'webgl' as const, label: 'Output' }],
    resultFields: {},
    stripOnExport: ['noiseType', 'scale', 'octaves', 'speed', 'seed', 'directionX', 'directionY'],
    order: 330,
    available: true,
    category: 'animation',
    subcategory: 'Generators',
  },
  {
    type: 'shapeGenerator',
    label: 'Shape Generator',
    description: 'Generate shapes (rectangle, circle, polygon)',
    tags: ['shape', 'rectangle', 'circle', 'polygon', 'webgl', 'animation'],
    inputs: [
      { id: 'webgl-target-0', type: 'webgl' as const, label: 'Fill' },
      { id: 'webgl-target-1', type: 'webgl' as const, label: 'Border' },
      { id: 'webgl-target-2', type: 'webgl' as const, label: 'Background' },
    ],
    outputs: [{ id: 'webgl-source-0', type: 'webgl' as const, label: 'Output' }],
    resultFields: {},
    stripOnExport: [
      'shapeType', 'fillColor', 'fillAlpha', 'borderColor', 'borderWidth',
      'opacity', 'rotation', 'offsetX', 'offsetY', 'bgColor', 'bgAlpha',
      'width', 'height', 'cornerTL', 'cornerTR', 'cornerBL', 'cornerBR',
      'radius', 'sides', 'starMode', 'innerRadius', 'polyRadius',
    ],
    order: 340,
    available: true,
    category: 'animation',
    subcategory: 'Generators',
  },
  {
    type: 'webglPreview',
    label: 'WebGL Preview',
    description: 'Preview WebGL animation in real-time',
    tags: ['preview', 'webgl', 'animation', 'display'],
    inputs: [{ id: 'webgl-target-0', type: 'webgl' as const, label: 'Source' }],
    outputs: [],
    resultFields: {},
    stripOnExport: ['fpsCap', 'resolutionPreset', 'customWidth', 'customHeight', 'isPlaying', 'activeSourceIndex'],
    order: 310,
    available: true,
    category: 'animation',
    subcategory: 'Preview',
  },
  {
    type: 'imageLayer',
    label: 'Image Layer',
    description: 'Use an AI-generated image as a WebGL texture',
    tags: ['image', 'layer', 'texture', 'webgl', 'animation', 'bridge'],
    inputs: [{ id: 'image-target-0', type: 'image' as const, label: 'Image' }],
    outputs: [{ id: 'webgl-source-0', type: 'webgl' as const, label: 'Output' }],
    resultFields: {},
    stripOnExport: ['imageUrl'],
    order: 350,
    available: true,
    category: 'animation',
    subcategory: 'Generators',
  },
  {
    type: 'textLayer',
    label: 'Text Layer',
    description: 'Render text as a WebGL texture',
    tags: ['text', 'layer', 'font', 'webgl', 'animation'],
    inputs: [{ id: 'webgl-target-0', type: 'webgl' as const, label: 'Fill' }],
    outputs: [{ id: 'webgl-source-0', type: 'webgl' as const, label: 'Output' }],
    resultFields: {},
    stripOnExport: [
      'text', 'fontFamily', 'fontSize', 'fontColor', 'alignment', 'bold', 'italic',
      'outlineColor', 'outlineWidth', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
      'shadowBlur', 'textBoxWidth', 'offsetX', 'offsetY', 'bgColor', 'bgAlpha',
    ],
    order: 360,
    available: true,
    category: 'animation',
    subcategory: 'Generators',
  },
  {
    type: 'blurEffect',
    label: 'Blur Effect',
    description: 'Apply blur (gaussian, radial, motion) to a WebGL texture',
    tags: ['blur', 'effect', 'gaussian', 'radial', 'motion', 'webgl', 'animation'],
    inputs: [{ id: 'webgl-target-0', type: 'webgl' as const, label: 'Input' }],
    outputs: [{ id: 'webgl-source-0', type: 'webgl' as const, label: 'Output' }],
    resultFields: {},
    stripOnExport: ['blurType', 'bypass', 'radius', 'strength', 'centerX', 'centerY', 'angle', 'preset'],
    order: 400,
    available: true,
    category: 'animation',
    subcategory: 'Effects',
  },
  {
    type: 'canvasNote',
    label: 'Note',
    description: 'Annotation note for documenting workflows',
    tags: ['note', 'annotation', 'documentation', 'tools'],
    inputs: [],
    outputs: [],
    resultFields: {},
    stripOnExport: [],
    order: 200,
    available: true,
    category: 'tools',
  },
] as const satisfies readonly NodeRegistryEntry[];

const NODE_REGISTRY: readonly NodeRegistryEntry[] = NODE_REGISTRY_ARRAY;

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

/**
 * Get node templates for UI consumers (CommandPalette, ContextMenu, Sidebar).
 * Returns only available nodes sorted by display order.
 */
export function getNodeTemplates(): NodeTemplate[] {
  return [...NODE_REGISTRY]
    .filter((e) => e.available)
    .sort((a, b) => a.order - b.order)
    .map((e) => ({
      label: e.label,
      nodeType: e.type,
      inputs: e.inputs as PortDefinition[],
      outputs: e.outputs as PortDefinition[],
      description: e.description,
      tags: e.tags as string[],
      category: e.category,
      subcategory: e.subcategory,
    }));
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
