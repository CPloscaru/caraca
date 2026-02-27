import type { PortType } from '@/lib/port-types';

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
  schemaParams?: Record<string, unknown>;
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

export type TextDisplayData = NodeData & {
  displayText: string | null;
};

export type ImageUpscaleData = NodeData & {
  model: string;
  scaleFactor: number;
  prompt: string;
  outputImage: { url: string; width: number; height: number } | null;
  inputImageUrl: string | null;
  inputDimensions: { width: number; height: number } | null;
  schemaParams?: Record<string, unknown>;
  debugRequest?: unknown;
  debugResponse?: unknown;
  debugError?: unknown;
};

export type DynamicImagePortConfig = {
  fieldName: string;
  multi: boolean;
  maxConnections: number;
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
  schemaParams?: Record<string, unknown>;
  dynamicImagePorts?: DynamicImagePortConfig[];
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
  schemaParams?: Record<string, unknown>;
  dynamicImagePorts?: DynamicImagePortConfig[];
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

export type NoteNodeData = NodeData & {
  noteTitle: string;
  noteBody: string;
};

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

