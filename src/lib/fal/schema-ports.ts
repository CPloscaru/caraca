// ---------------------------------------------------------------------------
// Schema-tree-based image port extraction
// Walks the SchemaNode tree to find image input ports, replacing the flat
// pattern-matching in getSchemaImageFields.
// ---------------------------------------------------------------------------

import type { SchemaNode } from './schema-tree';
import { humanizeFieldName, type DynamicImagePort } from './schema-introspection';

// ---------------------------------------------------------------------------
// Image field detection
// ---------------------------------------------------------------------------

const IMAGE_FIELD_PATTERNS = [
  /image_url$/,
  /^image$/,
  /^start_image/,
  /^end_image/,
  /^last_frame/,
  /^tail_image/,
  /^frontal_image/,
  /^reference_image/,
];

function isImageFieldName(name: string): boolean {
  return IMAGE_FIELD_PATTERNS.some((p) => p.test(name));
}

/** Check if a leaf node represents an image URL field. */
function isImageNode(node: SchemaNode): boolean {
  // ui hint takes priority
  if (node.uiHint === 'image' || node.uiHint === 'file') return true;
  // string field matching known image patterns
  if (node.kind === 'string' && isImageFieldName(node.name)) return true;
  return false;
}

/** Check if an array node contains image URLs. */
function isImageArrayNode(node: SchemaNode): boolean {
  if (node.kind !== 'array') return false;
  // Array of strings with image-like name
  if (node.itemSchema?.kind === 'string' && node.name.includes('image')) return true;
  // ui hint
  if (node.uiHint === 'image' || node.uiHint === 'file') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Recursive port extraction
// ---------------------------------------------------------------------------

/**
 * Extract dynamic image ports by walking the schema tree.
 * Handles:
 * - Top-level image string fields → single port
 * - Top-level image array fields → multi port
 * - Nested objects (e.g. elements array with image children) → dot-path ports
 */
export function extractImagePorts(root: SchemaNode[]): DynamicImagePort[] {
  const ports: DynamicImagePort[] = [];

  for (const node of root) {
    collectImagePorts(node, ports);
  }

  return ports;
}

function collectImagePorts(node: SchemaNode, ports: DynamicImagePort[]): void {
  // Top-level single image field
  if (isImageNode(node)) {
    ports.push({
      fieldName: node.path,
      label: humanizeFieldName(node.name),
      required: node.required,
      description: node.description,
      multi: false,
      maxConnections: 1,
    });
    return;
  }

  // Top-level image array
  if (isImageArrayNode(node)) {
    ports.push({
      fieldName: node.path,
      label: humanizeFieldName(node.name),
      required: node.required,
      description: node.description,
      multi: true,
      maxConnections: node.maxItems ?? 4,
    });
    return;
  }

  // Array of objects — recurse into itemSchema to find nested image fields
  if (node.kind === 'array' && node.itemSchema?.kind === 'object' && node.itemSchema.children) {
    for (const child of node.itemSchema.children) {
      collectImagePorts(child, ports);
    }
    return;
  }

  // Object — recurse into children to find nested image fields
  if (node.kind === 'object' && node.children) {
    for (const child of node.children) {
      collectImagePorts(child, ports);
    }
    return;
  }
}
