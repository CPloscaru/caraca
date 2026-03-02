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
  debugRequest?: unknown;
  debugResponse?: unknown;
  debugError?: unknown;
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

// ---------------------------------------------------------------------------
// WebGL preview node types (Phase 42)
// ---------------------------------------------------------------------------

export type ResolutionPreset = '720p' | '1080p' | '4k' | 'custom';
export type FpsCap = 15 | 30 | 60;

export const RESOLUTION_PRESETS: Record<Exclude<ResolutionPreset, 'custom'>, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

export type WebGLPreviewData = NodeData & {
  fpsCap: FpsCap;
  resolutionPreset: ResolutionPreset;
  customWidth: number;
  customHeight: number;
  isPlaying: boolean;
  activeSourceIndex: number;
};

// ---------------------------------------------------------------------------
// WebGL generator node types (Phase 42)
// ---------------------------------------------------------------------------

export type GradientType = 'linear' | 'radial' | 'mesh';

export type ColorStop = {
  color: string;   // hex color e.g. "#ff0000"
  position: number; // 0-1
};

export type GradientGeneratorData = NodeData & {
  gradientType: GradientType;
  colorStops: ColorStop[];
  angle: number;      // 0-360, linear only
  speed: number;      // animation speed multiplier (0-5, default 1)
  width: number;      // render target width
  height: number;     // render target height
};

// ---------------------------------------------------------------------------
// Solid Color node types (Phase 43)
// ---------------------------------------------------------------------------

export type SolidColorData = NodeData & {
  color: string;
  alpha: number;
};

// ---------------------------------------------------------------------------
// Noise Generator node types (Phase 43)
// ---------------------------------------------------------------------------

export type NoiseType = 'perlin' | 'simplex' | 'worley' | 'cellular';

export type NoiseGeneratorData = NodeData & {
  noiseType: NoiseType;
  scale: number;
  octaves: number;
  speed: number;
  seed: number;
  directionX: number;
  directionY: number;
};

// ---------------------------------------------------------------------------
// Image Layer node types (Phase 43)
// ---------------------------------------------------------------------------

export type ImageLayerData = NodeData & {
  imageUrl: string | null;
};

// ---------------------------------------------------------------------------
// Text Layer node types (Phase 43)
// ---------------------------------------------------------------------------

export type TextLayerData = NodeData & {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  alignment: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  textBoxWidth: number;
  offsetX: number;
  offsetY: number;
  bgColor: string;
  bgAlpha: number;
};

// ---------------------------------------------------------------------------
// Shape Generator node types (Phase 43)
// ---------------------------------------------------------------------------

export type ShapeType = 'rectangle' | 'circle' | 'polygon';

export type ShapeGeneratorData = NodeData & {
  shapeType: ShapeType;
  fillColor: string;
  fillAlpha: number;
  borderColor: string;
  borderWidth: number;
  opacity: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  bgColor: string;
  bgAlpha: number;
  // Rectangle-specific
  width: number;
  height: number;
  cornerTL: number;
  cornerTR: number;
  cornerBL: number;
  cornerBR: number;
  // Circle-specific
  radius: number;
  // Polygon-specific
  sides: number;
  starMode: boolean;
  innerRadius: number;
  polyRadius: number;
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

