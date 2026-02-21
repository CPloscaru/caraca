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
