import type { Node, Edge } from '@xyflow/react';
import type { PortType } from '@/lib/port-types';

export type { PortType } from '@/lib/port-types';

export type PortDefinition = {
  type: PortType;
  label: string;
  id: string;
};

export type NodeData = {
  label: string;
  type: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
};

export type AppNode = Node<NodeData>;

export type AppEdge = Edge;

// ---------------------------------------------------------------------------
// Extended node data types for Phase 2 core nodes
// ---------------------------------------------------------------------------

export type TextInputData = NodeData & {
  value: string;
};

export type ImageImportData = NodeData & {
  imageUrl: string | null;
  fileName: string | null;
};

export type ImageGeneratorData = NodeData & {
  prompt: string;
  model: string;
  aspectRatio: string;
  numImages: number;
  images: Array<{ url: string; width: number; height: number }>;
  selectedImageIndex: number;
  /** Persisted generation mode — set to 'image-to-image' on image input connect, NOT cleared on disconnect */
  mode?: 'text-to-image' | 'image-to-image';
  /** Schema-derived image_size string enum (e.g. "landscape_4_3"). When present, executor sends this instead of width/height. */
  imageSizeOption?: string;
  debugRequest?: unknown;
  debugResponse?: unknown;
  debugError?: unknown;
};

export type LLMAssistantData = NodeData & {
  instruction: string;
  model: string;
  output: string | null;
  outputExpanded: boolean;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
};

export type ImageUpscaleData = NodeData & {
  model: string;
  scaleFactor: number;
  prompt: string;
  outputImage: { url: string; width: number; height: number } | null;
  inputImageUrl: string | null;
  inputDimensions: { width: number; height: number } | null;
  debugRequest?: unknown;
  debugResponse?: unknown;
  debugError?: unknown;
};

export type TextToVideoData = NodeData & {
  model: string;
  prompt: string;
  aspectRatio: string;
  duration: number;
  seed: number | null;
  videoUrl: string | null;
  cdnUrl: string | null;
  videoResults: Array<{ videoUrl: string; cdnUrl: string }> | null;
  debugRequest?: unknown;
  debugResponse?: unknown;
  debugError?: unknown;
};

export type ImageToVideoData = NodeData & {
  model: string;
  prompt: string;
  aspectRatio: string;
  duration: number;
  seed: number | null;
  videoUrl: string | null;
  cdnUrl: string | null;
  videoResults: Array<{ videoUrl: string; cdnUrl: string }> | null;
  debugRequest?: unknown;
  debugResponse?: unknown;
  debugError?: unknown;
};

export type BatchResultItem = {
  index: number;
  inputValue: string;
  result: Record<string, unknown> | null;
  error: string | null;
  status: 'done' | 'error' | 'skipped';
};

export type BatchParameterData = NodeData & {
  values: string[];              // List of values to iterate
  errorMode: 'skip' | 'stop';   // Error handling strategy
  appendMode: boolean;           // Replace or append on re-run
  batchResults: BatchResultItem[] | null; // Collected results
};

/** Union type for all node data variants */
export type AnyNodeData =
  | NodeData
  | TextInputData
  | ImageImportData
  | ImageGeneratorData
  | LLMAssistantData
  | ImageUpscaleData
  | TextToVideoData
  | ImageToVideoData
  | BatchParameterData;

// ---------------------------------------------------------------------------
// Workflow JSON — serialized React Flow state for project persistence
// ---------------------------------------------------------------------------

export type WorkflowJson = {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
    type: string;
  }>;
  viewport: { x: number; y: number; zoom: number };
};

/** Typed node variants */
export type TextInputNode = Node<TextInputData>;
export type ImageImportNode = Node<ImageImportData>;
export type ImageGeneratorNode = Node<ImageGeneratorData>;
export type LLMAssistantNode = Node<LLMAssistantData>;
export type ImageUpscaleNode = Node<ImageUpscaleData>;
export type TextToVideoNode = Node<TextToVideoData>;
export type ImageToVideoNode = Node<ImageToVideoData>;
export type BatchParameterNode = Node<BatchParameterData>;
