// ---------------------------------------------------------------------------
// Model schema introspection for fal.ai models
// Fetches OpenAPI schemas and derives dynamic port/field configuration
// ---------------------------------------------------------------------------

import { parseSchemaTree, type SchemaNode } from './schema-tree';
import { extractImagePorts } from './schema-ports';

export type { SchemaNode } from './schema-tree';

export type ModelInputField = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
  nullable?: boolean;
};

export type ModelNodeConfig = {
  hasPrompt: boolean;
  hasImageUrl: boolean;
  hasLastFrame: boolean;
  hasSeed: boolean;
  hasDuration: boolean;
  hasAspectRatio: boolean;
  aspectRatioOptions?: string[];
  durationOptions?: number[];
  hasNumImages: boolean;
  hasGuidanceScale: boolean;
  hasNegativePrompt: boolean;
  hasImageSize: boolean;
  imageSizeOptions?: string[];
};

// Module-level caches
const schemaCache = new Map<string, ModelInputField[]>();
const treeCache = new Map<string, SchemaNode[]>();

/**
 * Fetch the OpenAPI schema for a fal.ai model endpoint and extract input fields.
 * Returns an empty array on any error (graceful fallback).
 * Also caches the schema tree for use by fetchSchemaTree().
 */
export async function fetchModelSchema(
  endpointId: string,
): Promise<ModelInputField[]> {
  const cached = schemaCache.get(endpointId);
  if (cached) return cached;

  try {
    const response = await fetch(`/api/fal/schema?endpoint_id=${encodeURIComponent(endpointId)}`);
    if (!response.ok) return [];

    const spec = (await response.json()) as Record<string, unknown>;
    const result = parseSchemaTree(spec);
    if (!result) return [];

    // Cache both representations
    const fields: ModelInputField[] = result.flatFields;
    schemaCache.set(endpointId, fields);
    treeCache.set(endpointId, result.root);

    return fields;
  } catch {
    return [];
  }
}

/**
 * Fetch the schema tree for a fal.ai model. Must be called after fetchModelSchema.
 * Returns the cached tree or fetches if not yet available.
 */
export async function fetchSchemaTree(
  endpointId: string,
): Promise<SchemaNode[]> {
  const cached = treeCache.get(endpointId);
  if (cached) return cached;

  // Trigger full fetch which populates both caches
  await fetchModelSchema(endpointId);
  return treeCache.get(endpointId) ?? [];
}

// ---------------------------------------------------------------------------
// Dynamic image port extraction
// ---------------------------------------------------------------------------

export type DynamicImagePort = {
  fieldName: string;      // Original schema field name (e.g. "start_image_url")
  label: string;          // Human-readable label (e.g. "Start Image")
  required: boolean;      // From schema required array
  description?: string;   // Schema description for tooltip
  multi: boolean;         // true for array fields (multi-connection)
  maxConnections: number; // 1 for single, N for arrays
};

/**
 * Convert a snake_case field name to a human-readable Title Case label.
 * Strips `_url` and `_urls` suffixes before converting.
 */
export function humanizeFieldName(name: string): string {
  const stripped = name.replace(/_urls?$/, '');
  return stripped
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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

function isImageField(field: ModelInputField): boolean {
  return (
    field.type === 'string' &&
    IMAGE_FIELD_PATTERNS.some((pattern) => pattern.test(field.name))
  );
}

/**
 * Extract dynamic image ports from model input fields.
 * Uses the schema tree when available for proper nested field discovery.
 * Falls back to flat pattern matching if tree is not cached.
 */
export function getSchemaImageFields(
  fields: ModelInputField[],
  schemaTree?: SchemaNode[],
): DynamicImagePort[] {
  // Use tree-based extraction when available
  if (schemaTree && schemaTree.length > 0) {
    return extractImagePorts(schemaTree);
  }

  // Flat fallback (for backward compatibility when tree is not available)
  const ports: DynamicImagePort[] = [];

  for (const field of fields) {
    // Special case: elements array (Kling O3 style)
    if (field.name === 'elements' && field.type === 'array') {
      ports.push({
        fieldName: 'elements.0.frontal_image_url',
        label: 'Frontal Image',
        required: false,
        description: field.description,
        multi: false,
        maxConnections: 1,
      });
      ports.push({
        fieldName: 'elements.0.reference_image_urls',
        label: 'Reference Images',
        required: false,
        description: field.description,
        multi: true,
        maxConnections: 3,
      });
      continue;
    }

    // Array fields with "image" in the name → multi-connection port
    if (field.type === 'array' && field.name.includes('image')) {
      ports.push({
        fieldName: field.name,
        label: humanizeFieldName(field.name),
        required: field.required,
        description: field.description,
        multi: true,
        maxConnections: field.maximum ?? 4,
      });
      continue;
    }

    // Single image fields
    if (isImageField(field)) {
      ports.push({
        fieldName: field.name,
        label: humanizeFieldName(field.name),
        required: field.required,
        description: field.description,
        multi: false,
        maxConnections: 1,
      });
    }
  }

  return ports;
}

// ---------------------------------------------------------------------------
// Default set of fields excluded from "More Settings" (handled by dedicated UI)
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDED_FIELDS = new Set([
  'prompt',
  'sync_mode',
  'enable_safety_checker',
  'image_size',
  'aspect_ratio',
  'duration',
  'num_images',
]);

// Types that indicate complex/nested structures we can't render generically
const COMPLEX_TYPES = new Set(['object', 'array']);

/**
 * Filter schema fields to only those suitable for dynamic "More Settings" UI.
 * Excludes fields with dedicated UI, complex types, and $ref-only fields.
 */
export function getSchemaExtraFields(
  fields: ModelInputField[],
  excludeSet?: Set<string>,
): ModelInputField[] {
  const excluded = excludeSet
    ? new Set([...DEFAULT_EXCLUDED_FIELDS, ...excludeSet])
    : DEFAULT_EXCLUDED_FIELDS;

  return fields.filter((f) => {
    if (excluded.has(f.name)) return false;
    if (COMPLEX_TYPES.has(f.type)) return false;
    // Exclude image fields handled by dynamic image ports
    if (isImageField(f)) return false;
    return true;
  });
}

/**
 * Derive a node configuration from model input fields.
 * Inspects field names to determine what the model supports.
 */
export function deriveNodeConfig(fields: ModelInputField[]): ModelNodeConfig {
  const fieldMap = new Map(fields.map((f) => [f.name, f]));

  const aspectRatioField = fieldMap.get("aspect_ratio");
  const durationField = fieldMap.get("duration");
  const imageSizeField = fieldMap.get("image_size");

  return {
    hasPrompt: fieldMap.has("prompt"),
    hasImageUrl: fieldMap.has("image_url") || fieldMap.has("image"),
    hasLastFrame:
      fieldMap.has("last_frame_image_url") ||
      fieldMap.has("tail_image_url"),
    hasSeed: fieldMap.has("seed"),
    hasDuration: fieldMap.has("duration"),
    hasAspectRatio: fieldMap.has("aspect_ratio"),
    ...(aspectRatioField?.enum
      ? { aspectRatioOptions: aspectRatioField.enum as string[] }
      : {}),
    ...(durationField?.enum
      ? { durationOptions: durationField.enum as number[] }
      : {}),
    hasNumImages: fieldMap.has("num_images"),
    hasGuidanceScale: fieldMap.has("guidance_scale"),
    hasNegativePrompt: fieldMap.has("negative_prompt"),
    hasImageSize: fieldMap.has("image_size"),
    ...(imageSizeField?.enum
      ? { imageSizeOptions: imageSizeField.enum as string[] }
      : {}),
  };
}
