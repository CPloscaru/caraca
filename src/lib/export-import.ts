'use client';

import type { Node, Edge } from '@xyflow/react';
import { getKnownNodeTypes, getStripFields } from '@/lib/node-registry';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

type ExportInput = {
  title: string;
  nodes: Node[];
  edges: Edge[];
  screenshot?: string;
};

type ExportPayload = {
  version: 1;
  title: string;
  thumbnail?: string;
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

const THUMBNAIL_MAX_W = 640;
const THUMBNAIL_MAX_H = 360;
const THUMBNAIL_QUALITY = 0.7;
/** Base64 size threshold (~100 KB) below which we skip re-encoding */
const THUMBNAIL_SIZE_THRESHOLD = 100_000;

/**
 * Compress a data-URI screenshot to a JPEG thumbnail at reduced resolution.
 * If the source is already small enough it is returned as-is.
 */
function compressThumbnail(dataUri: string): string {
  // Rough base64 payload length (strip data:image/*;base64, prefix)
  const base64Start = dataUri.indexOf(',');
  if (base64Start !== -1 && dataUri.length - base64Start - 1 < THUMBNAIL_SIZE_THRESHOLD) {
    return dataUri;
  }

  const img = new Image();
  img.src = dataUri;

  // Image must already be loaded (synchronous data URI)
  let w = img.width || THUMBNAIL_MAX_W;
  let h = img.height || THUMBNAIL_MAX_H;

  if (w > THUMBNAIL_MAX_W || h > THUMBNAIL_MAX_H) {
    const scale = Math.min(THUMBNAIL_MAX_W / w, THUMBNAIL_MAX_H / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUri;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
}

export function exportWorkflow(project: ExportInput): void {
  // Dynamically strip fields declared by the registry (images, tokenUsage, videoUrl, etc.)
  const stripFields = getStripFields();

  const cleanNodes = project.nodes.map((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!stripFields.has(key)) {
        cleanData[key] = value;
      }
    }
    return {
      id: node.id,
      type: node.type ?? 'placeholder',
      position: node.position,
      data: cleanData,
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

  // Embed a compressed screenshot thumbnail when provided
  if (project.screenshot) {
    payload.thumbnail = compressThumbnail(project.screenshot);
  }

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

type ValidationResult =
  | { valid: true; data: { title: string; nodes: Node[]; edges: Edge[]; thumbnail?: string } }
  | { valid: false; error: string };

function validateWorkflowJson(json: unknown): ValidationResult {
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
  const knownTypes = getKnownNodeTypes();

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
    // Unknown types become placeholder nodes with original data preserved for lossless re-export
    if (!knownTypes.has(n.type)) {
      const originalType = n.type;
      const originalData = { ...(n.data as Record<string, unknown>) };
      n.type = 'placeholder';
      (n.data as Record<string, unknown>).__originalType = originalType;
      (n.data as Record<string, unknown>).__originalData = originalData;
      (n.data as Record<string, unknown>).label = `Unknown: ${originalType}`;
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
      ...(typeof obj.thumbnail === 'string' ? { thumbnail: obj.thumbnail } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export async function importWorkflow(
  file: File,
): Promise<{ title: string; nodes: Node[]; edges: Edge[]; thumbnail?: string }> {
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
