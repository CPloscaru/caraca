import type { Node, Edge } from '@xyflow/react';

export type PortType = 'image' | 'text' | 'mask' | 'model';

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
};

/** Union type for all node data variants */
export type AnyNodeData =
  | NodeData
  | TextInputData
  | ImageImportData
  | ImageGeneratorData;

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
