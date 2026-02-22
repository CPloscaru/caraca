import type { PortDefinition } from '@/types/canvas';

export type NodeTemplate = {
  label: string;
  nodeType: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  description: string;
  tags: string[];
};

export const NODE_TEMPLATES: NodeTemplate[] = [
  {
    label: 'Text Input',
    nodeType: 'textInput',
    inputs: [],
    outputs: [{ type: 'text', label: 'Text', id: 'text-out-0' }],
    description: 'Freeform text input',
    tags: ['text', 'input', 'prompt'],
  },
  {
    label: 'Image Import',
    nodeType: 'imageImport',
    inputs: [],
    outputs: [{ type: 'image', label: 'Image', id: 'image-out-0' }],
    description: 'Upload or drop an image',
    tags: ['image', 'upload', 'import'],
  },
  {
    label: 'Image Generator',
    nodeType: 'imageGenerator',
    inputs: [
      { type: 'text', label: 'Prompt', id: 'text-in-0' },
      { type: 'image', label: 'Reference', id: 'image-in-0' },
    ],
    outputs: [{ type: 'image', label: 'Output', id: 'image-out-0' }],
    description: 'Generate images with AI',
    tags: ['image', 'generate', 'ai', 'fal'],
  },
  {
    label: 'LLM Assistant',
    nodeType: 'llmAssistant',
    inputs: [{ type: 'image', label: 'Image', id: 'image-target-0' }],
    outputs: [{ type: 'text', label: 'Response', id: 'text-source-0' }],
    description: 'Enrich prompts with LLM',
    tags: ['llm', 'text', 'ai', 'prompt', 'assistant'],
  },
];
