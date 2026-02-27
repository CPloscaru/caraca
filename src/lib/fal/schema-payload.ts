// ---------------------------------------------------------------------------
// Schema-tree-based payload builder
// Builds nested API payloads from flat dot-path values using the schema tree.
// Replaces handleElementsPort and manual port mapping in executors.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Security: prototype pollution guard
// ---------------------------------------------------------------------------

const POISONED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

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
function setDeep(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const segments = dotPath.split('.');

  // Guard against prototype pollution attacks
  for (const seg of segments) {
    if (POISONED_SEGMENTS.has(seg)) {
      console.warn(`[SECURITY] Prototype pollution blocked: segment="${seg}", path="${dotPath}", type=prototype-pollution`);
      return;
    }
  }

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

