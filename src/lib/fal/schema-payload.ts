// ---------------------------------------------------------------------------
// Schema-tree-based payload builder
// Builds nested API payloads from flat dot-path values using the schema tree.
// Replaces handleElementsPort and manual port mapping in executors.
// ---------------------------------------------------------------------------

import type { SchemaNode } from './schema-tree';

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

/**
 * Set a value at a dot-path inside a nested object, creating intermediate
 * objects/arrays as needed.
 *
 * Example: setDeep(obj, "elements.0.frontal_image_url", "http://...") creates
 * obj.elements = [{ frontal_image_url: "http://..." }]
 */
export function setDeep(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const segments = dotPath.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];
    const nextIsIndex = /^\d+$/.test(nextSeg);

    if (!(seg in current) || current[seg] == null) {
      // If the next segment is a numeric index, create an array; otherwise object
      current[seg] = nextIsIndex ? [] : {};
    }

    const child = current[seg];
    if (Array.isArray(child)) {
      const idx = Number(nextSeg);
      if (child[idx] == null) child[idx] = {};
      // Skip the numeric segment — we already indexed into the array
      current = child[idx] as Record<string, unknown>;
      i++; // skip next segment
    } else {
      current = child as Record<string, unknown>;
    }
  }

  const lastSeg = segments[segments.length - 1];
  current[lastSeg] = value;
}

/**
 * Build a fal.ai payload from image port inputs using dot-path field names.
 * Handles single images, multi-image arrays, and nested paths (elements.0.field).
 *
 * @param ports Array of { fieldName, multi } port configs
 * @param inputs Map of handleId → input value (URL string or string[])
 * @param resolveUrl Async function to resolve/upload a URL to fal CDN
 */
export async function buildImagePayload(
  ports: Array<{ fieldName: string; multi: boolean }>,
  inputs: Record<string, unknown>,
  resolveUrl: (url: string) => Promise<string>,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};

  for (const port of ports) {
    const handleId = `image-target-${port.fieldName}`;
    const inputValue = inputs[handleId];
    if (!inputValue) continue;

    let resolved: unknown;
    if (port.multi) {
      const urls = Array.isArray(inputValue) ? inputValue : [inputValue];
      resolved = await Promise.all(urls.map((u) => resolveUrl(u as string)));
    } else {
      resolved = await resolveUrl(inputValue as string);
    }

    setDeep(payload, port.fieldName, resolved);
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Text port input mapping
// ---------------------------------------------------------------------------

/**
 * Apply text port inputs to the fal payload.
 * Reads all `text-target-{path}` inputs (except `text-target-0` which is the
 * main prompt) and injects them into the payload via setDeep.
 * This handles nested paths like `multi_prompt.0.prompt`.
 */
export function applyTextPortInputs(
  inputs: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(inputs)) {
    if (!key.startsWith('text-target-')) continue;
    // Skip the main prompt handle (text-target-0 / text-in-0)
    if (key === 'text-target-0') continue;
    if (value == null || value === '') continue;

    const fieldPath = key.slice('text-target-'.length);
    setDeep(payload, fieldPath, value);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationError = {
  path: string;
  message: string;
};

/**
 * Validate a payload against a schema tree. Returns an array of validation
 * errors (empty = valid). Only checks required fields currently.
 */
export function validatePayload(
  root: SchemaNode[],
  payload: Record<string, unknown>,
  imagePortInputs?: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of root) {
    validateNode(node, payload, errors, imagePortInputs);
  }

  return errors;
}

function validateNode(
  node: SchemaNode,
  payload: Record<string, unknown>,
  errors: ValidationError[],
  imagePortInputs?: Record<string, unknown>,
): void {
  if (!node.required) return;

  const value = getDeep(payload, node.path);

  // Image ports are provided via connected handles, not inline values
  if (imagePortInputs) {
    const handleId = `image-target-${node.path}`;
    if (handleId in imagePortInputs && imagePortInputs[handleId] != null) return;
  }

  if (value == null || value === '') {
    errors.push({
      path: node.path,
      message: `Required field "${node.name}" is missing`,
    });
  }

  // Recurse into children for object nodes
  if (node.kind === 'object' && node.children && typeof value === 'object' && value !== null) {
    for (const child of node.children) {
      validateNode(child, payload, errors, imagePortInputs);
    }
  }
}

/** Get a value at a dot-path from a nested object. */
function getDeep(obj: Record<string, unknown>, dotPath: string): unknown {
  const segments = dotPath.split('.');
  let current: unknown = obj;

  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const idx = Number(seg);
      current = current[idx];
    } else {
      current = (current as Record<string, unknown>)[seg];
    }
  }

  return current;
}
