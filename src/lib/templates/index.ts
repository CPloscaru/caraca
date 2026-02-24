import type { Node, Edge } from '@xyflow/react';

import wf1 from './wf1-simple-text-to-image.json';
import wf2 from './wf2-llm-assisted.json';
import wf3 from './wf3-style-reference.json';
import wf4 from './wf4-variation-chain.json';
import wf5 from './wf5-batch-generation.json';
import wf6 from './wf6-upscale-pipeline.json';
import wf7 from './wf7-text-to-video.json';
import wf8 from './wf8-image-to-video.json';

export type BuiltinTemplate = {
  id: string;
  title: string;
  description: string;
  thumbnailGradient: string;
  nodes: Node[];
  edges: Edge[];
  isNew?: boolean;
};

function toTemplate(
  id: string,
  json: { title: string; description: string; nodes: unknown[]; edges: unknown[] },
  gradient: string,
  isNew: boolean = false,
): BuiltinTemplate {
  return {
    id,
    title: json.title,
    description: json.description,
    thumbnailGradient: gradient,
    nodes: json.nodes as Node[],
    edges: json.edges as Edge[],
    isNew,
  };
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  // New v1.2 templates first
  toTemplate('wf8', wf8, 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', true),
  toTemplate('wf7', wf7, 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)', true),
  toTemplate('wf6', wf6, 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)', true),
  toTemplate('wf5', wf5, 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)', true),
  // Existing templates
  toTemplate('wf1', wf1, 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
  toTemplate('wf2', wf2, 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'),
  toTemplate('wf3', wf3, 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'),
  toTemplate('wf4', wf4, 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'),
];
