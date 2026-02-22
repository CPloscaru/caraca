'use client';

import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

type ExportInput = {
  title: string;
  nodes: Node[];
  edges: Edge[];
};

type ExportPayload = {
  version: 1;
  title: string;
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
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workflow';
}

export function exportWorkflow(project: ExportInput): void {
  // Strip images from node data (export is workflow-only)
  const cleanNodes = project.nodes.map((node) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { images, imageUrl, tokenUsage, outputExpanded, ...rest } = (node.data ?? {}) as Record<string, unknown>;
    return {
      id: node.id,
      type: node.type ?? 'placeholder',
      position: node.position,
      data: rest,
    };
  });

  const cleanEdges = project.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: edge.type ?? 'turbo',
  }));

  const payload: ExportPayload = {
    version: 1,
    title: project.title,
    nodes: cleanNodes,
    edges: cleanEdges,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(project.title)}.caraca.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

const KNOWN_NODE_TYPES = new Set([
  'textInput',
  'imageImport',
  'imageGenerator',
  'llmAssistant',
  'placeholder',
]);

type ValidationResult =
  | { valid: true; data: { title: string; nodes: Node[]; edges: Edge[] } }
  | { valid: false; error: string };

export function validateWorkflowJson(json: unknown): ValidationResult {
  if (typeof json !== 'object' || json === null) {
    return { valid: false, error: 'File is not a valid JSON object.' };
  }

  const obj = json as Record<string, unknown>;

  if (obj.version !== 1) {
    return { valid: false, error: 'Unsupported version. Expected version 1.' };
  }

  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
    return { valid: false, error: 'Missing or empty workflow title.' };
  }

  if (!Array.isArray(obj.nodes)) {
    return { valid: false, error: 'Missing nodes array.' };
  }

  if (!Array.isArray(obj.edges)) {
    return { valid: false, error: 'Missing edges array.' };
  }

  const nodeIds = new Set<string>();

  for (const node of obj.nodes) {
    if (typeof node !== 'object' || node === null) {
      return { valid: false, error: 'Invalid node entry.' };
    }
    const n = node as Record<string, unknown>;
    if (typeof n.id !== 'string') {
      return { valid: false, error: 'Node missing id.' };
    }
    if (typeof n.type !== 'string') {
      return { valid: false, error: `Node "${n.id}" missing type.` };
    }
    if (!KNOWN_NODE_TYPES.has(n.type)) {
      return { valid: false, error: `Unknown node type "${n.type}" in node "${n.id}".` };
    }
    if (
      typeof n.position !== 'object' ||
      n.position === null ||
      typeof (n.position as Record<string, unknown>).x !== 'number' ||
      typeof (n.position as Record<string, unknown>).y !== 'number'
    ) {
      return { valid: false, error: `Node "${n.id}" has invalid position.` };
    }
    if (typeof n.data !== 'object' || n.data === null) {
      return { valid: false, error: `Node "${n.id}" missing data.` };
    }
    nodeIds.add(n.id);
  }

  for (const edge of obj.edges) {
    if (typeof edge !== 'object' || edge === null) {
      return { valid: false, error: 'Invalid edge entry.' };
    }
    const e = edge as Record<string, unknown>;
    if (typeof e.id !== 'string') {
      return { valid: false, error: 'Edge missing id.' };
    }
    if (typeof e.source !== 'string' || typeof e.target !== 'string') {
      return { valid: false, error: `Edge "${e.id}" missing source or target.` };
    }
    if (!nodeIds.has(e.source)) {
      return { valid: false, error: `Edge "${e.id}" references unknown source node "${e.source}".` };
    }
    if (!nodeIds.has(e.target)) {
      return { valid: false, error: `Edge "${e.id}" references unknown target node "${e.target}".` };
    }
  }

  return {
    valid: true,
    data: {
      title: obj.title as string,
      nodes: obj.nodes as Node[],
      edges: obj.edges as Edge[],
    },
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export async function importWorkflow(
  file: File,
): Promise<{ title: string; nodes: Node[]; edges: Edge[] }> {
  const text = await file.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  const result = validateWorkflowJson(json);
  if (!result.valid) {
    throw new Error(result.error);
  }

  return result.data;
}
