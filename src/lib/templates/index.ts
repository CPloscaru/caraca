import type { Node, Edge } from '@xyflow/react';

import wf1 from './wf1-simple-text-to-image.json';
import wf2 from './wf2-llm-assisted.json';
import wf3 from './wf3-style-reference.json';
import wf4 from './wf4-variation-chain.json';
import wf5 from './wf5-batch-generation.json';

export type BuiltinTemplate = {
  id: string;
  title: string;
  description: string;
  thumbnailGradient: string;
  nodes: Node[];
  edges: Edge[];
};

function toTemplate(
  id: string,
  json: { title: string; description: string; nodes: unknown[]; edges: unknown[] },
  gradient: string,
): BuiltinTemplate {
  return {
    id,
    title: json.title,
    description: json.description,
    thumbnailGradient: gradient,
    nodes: json.nodes as Node[],
    edges: json.edges as Edge[],
  };
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  toTemplate('wf1', wf1, 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
  toTemplate('wf2', wf2, 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'),
  toTemplate('wf3', wf3, 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'),
  toTemplate('wf4', wf4, 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'),
  toTemplate('wf5', wf5, 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'),
];
