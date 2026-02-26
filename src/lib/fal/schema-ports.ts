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
export function isImageNode(node: SchemaNode): boolean {
  // ui hint takes priority
  if (node.uiHint === 'image' || node.uiHint === 'file') return true;
  // string field matching known image patterns
  if (node.kind === 'string' && isImageFieldName(node.name)) return true;
  return false;
}

/** Check if a leaf node represents a connectable text field (non-enum, non-image string). */
export function isTextNode(node: SchemaNode): boolean {
  if (node.kind !== 'string') return false;
  if (node.enum && node.enum.length > 0) return false;
  if (isImageNode(node)) return false;
  if (node.name === 'seed') return false;
  if (node.format === 'uri') return false;
  if (/_url$/.test(node.name) || /^url$/.test(node.name)) return false;
  return true;
}

/** Check if an array node contains image URLs. */
export function isImageArrayNode(node: SchemaNode): boolean {
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
      maxConnections: node.maxItems,
    });
    return;
  }

  // Array of objects — skip. Per-element image ports are created dynamically
  // by RepeatableBlock based on the current element count, not statically here.
  if (node.kind === 'array' && node.itemSchema?.kind === 'object' && node.itemSchema.children) {
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

/**
 * Compute per-element image ports for arrays of objects with image children.
 * Called dynamically when element counts change (not during static extraction).
 */
export function computePerElementPorts(
  root: SchemaNode[],
  elementCounts: Record<string, number>,
): DynamicImagePort[] {
  const ports: DynamicImagePort[] = [];

  for (const node of root) {
    if (node.kind !== 'array' || node.itemSchema?.kind !== 'object' || !node.itemSchema.children) {
      continue;
    }

    const imgChildren = node.itemSchema.children.filter(
      (c) => isImageNode(c) || isImageArrayNode(c),
    );
    if (imgChildren.length === 0) continue;

    const count = elementCounts[node.path] ?? 1;

    for (let i = 0; i < count; i++) {
      for (const child of imgChildren) {
        const isMulti = isImageArrayNode(child);
        ports.push({
          fieldName: `${node.path}.${i}.${child.name}`,
          label: humanizeFieldName(child.name),
          required: child.required,
          description: child.description,
          multi: isMulti,
          maxConnections: isMulti ? child.maxItems : 1,
        });
      }
    }
  }

  return ports;
}
