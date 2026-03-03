import type { Node, Edge } from '@xyflow/react';

import wf1 from './wf1-simple-text-to-image.json';
import wf2 from './wf2-llm-assisted.json';
import wf3 from './wf3-style-reference.json';
import wf4 from './wf4-variation-chain.json';
import wf5 from './wf5-batch-generation.json';
import wf6 from './wf6-upscale-pipeline.json';
import wf7 from './wf7-text-to-video.json';
import wf8 from './wf8-image-to-video.json';
import wf9 from './wf9-gradient-loop.json';
import wf10 from './wf10-generative-art.json';
import wf11 from './wf11-ai-webgl-ai.json';

export type TemplateCategory = 'ai' | 'animation';

type BuiltinTemplate = {
  id: string;
  title: string;
  description: string;
  thumbnailGradient: string;
  nodes: Node[];
  edges: Edge[];
  isNew?: boolean;
  category: TemplateCategory;
  tags?: string[];
};

function toTemplate(
  id: string,
  json: { title: string; description: string; nodes: unknown[]; edges: unknown[] },
  gradient: string,
  opts: { isNew?: boolean; category?: TemplateCategory; tags?: string[] } = {},
): BuiltinTemplate {
  return {
    id,
    title: json.title,
    description: json.description,
    thumbnailGradient: gradient,
    nodes: json.nodes as Node[],
    edges: json.edges as Edge[],
    isNew: opts.isNew ?? false,
    category: opts.category ?? 'ai',
    tags: opts.tags,
  };
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  // Animation templates (new)
  toTemplate('wf9', wf9, 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%)', {
    isNew: true,
    category: 'animation',
    tags: ['gradient', 'mouse', 'animation', 'export'],
  }),
  toTemplate('wf10', wf10, 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', {
    isNew: true,
    category: 'animation',
    tags: ['noise', 'shapes', 'effects', 'animation'],
  }),
  toTemplate('wf11', wf11, 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', {
    isNew: true,
    category: 'animation',
    tags: ['ai', 'bridge', 'effects', 'animation'],
  }),
  // AI templates
  toTemplate('wf8', wf8, 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', { isNew: true }),
  toTemplate('wf7', wf7, 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)', { isNew: true }),
  toTemplate('wf6', wf6, 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)', { isNew: true }),
  toTemplate('wf5', wf5, 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)', { isNew: true }),
  toTemplate('wf1', wf1, 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
  toTemplate('wf2', wf2, 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'),
  toTemplate('wf3', wf3, 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'),
  toTemplate('wf4', wf4, 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'),
];

/** Filter templates by category. */
export function getTemplatesByCategory(cat: TemplateCategory): BuiltinTemplate[] {
  return BUILTIN_TEMPLATES.filter((t) => t.category === cat);
}
