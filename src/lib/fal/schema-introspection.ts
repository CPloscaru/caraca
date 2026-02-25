// ---------------------------------------------------------------------------
// Model schema introspection for fal.ai models
// Fetches OpenAPI schemas and derives dynamic port/field configuration
// ---------------------------------------------------------------------------

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

// Module-level cache to avoid re-fetching on every model selection
const schemaCache = new Map<string, ModelInputField[]>();

/**
 * Resolve a $ref pointer (e.g. "#/components/schemas/Foo") against the spec.
 */
function resolveRef(
  spec: Record<string, unknown>,
  ref: string,
): Record<string, unknown> | undefined {
  // Only handle local JSON pointer refs like "#/components/schemas/..."
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: unknown = spec;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current as Record<string, unknown> | undefined;
}

/**
 * Find the POST path that matches the endpoint. fal.ai OpenAPI specs use
 * the full endpoint path (e.g. "/fal-ai/minimax/video-01-live") not "/".
 */
function findPostSchema(
  spec: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return undefined;

  // Look through all paths for one with a POST that has a requestBody
  for (const pathObj of Object.values(paths)) {
    const post = pathObj?.post as Record<string, unknown> | undefined;
    if (!post?.requestBody) continue;

    const requestBody = post.requestBody as Record<string, unknown>;
    const content = requestBody.content as Record<string, unknown> | undefined;
    if (!content) continue;

    const jsonContent = content["application/json"] as Record<string, unknown> | undefined;
    if (!jsonContent) continue;

    let schema = jsonContent.schema as Record<string, unknown> | undefined;
    if (!schema) continue;

    // Resolve $ref if the schema is a reference
    if (schema.$ref && typeof schema.$ref === "string") {
      schema = resolveRef(spec, schema.$ref);
    }

    if (schema?.properties) return schema;
  }

  return undefined;
}

/**
 * Fetch the OpenAPI schema for a fal.ai model endpoint and extract input fields.
 * Returns an empty array on any error (graceful fallback).
 */
export async function fetchModelSchema(
  endpointId: string,
): Promise<ModelInputField[]> {
  const cached = schemaCache.get(endpointId);
  if (cached) return cached;

  try {
    // Route through the Next.js API route to avoid CORS issues
    const response = await fetch(`/api/fal/schema?endpoint_id=${encodeURIComponent(endpointId)}`);
    if (!response.ok) return [];

    const spec = (await response.json()) as Record<string, unknown>;

    const schema = findPostSchema(spec);
    if (!schema) return [];

    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return [];

    const requiredFields = (schema.required as string[]) ?? [];

    const fields: ModelInputField[] = Object.entries(properties).map(
      ([name, prop]) => {
        // Extract enum from direct property, anyOf, or allOf
        let enumValues = prop.enum as unknown[] | undefined;
        if (!enumValues) {
          const variants =
            (prop.anyOf as Record<string, unknown>[] | undefined) ??
            (prop.allOf as Record<string, unknown>[] | undefined);
          if (variants) {
            const withEnum = variants.find((v) => Array.isArray(v.enum));
            if (withEnum) enumValues = withEnum.enum as unknown[];
          }
        }

        // Resolve type from anyOf/allOf when direct type is missing
        let fieldType = prop.type as string | undefined;
        if (!fieldType) {
          const variants =
            (prop.anyOf as Record<string, unknown>[] | undefined) ??
            (prop.allOf as Record<string, unknown>[] | undefined);
          if (variants) {
            const withType = variants.find((v) => typeof v.type === "string");
            if (withType) fieldType = withType.type as string;
          }
        }

        // Extract min/max from direct properties or anyOf variants
        let minimum = prop.minimum as number | undefined;
        let maximum = prop.maximum as number | undefined;
        let nullable = false;

        const variants =
          (prop.anyOf as Record<string, unknown>[] | undefined) ??
          (prop.allOf as Record<string, unknown>[] | undefined);
        if (variants) {
          // Detect nullable (anyOf includes { type: "null" })
          if (variants.some((v) => v.type === "null")) {
            nullable = true;
          }
          // Extract min/max from non-null variants
          for (const v of variants) {
            if (v.type === "null") continue;
            if (minimum == null && typeof v.minimum === "number") minimum = v.minimum as number;
            if (maximum == null && typeof v.maximum === "number") maximum = v.maximum as number;
          }
        }

        return {
          name,
          type: fieldType ?? "string",
          required: requiredFields.includes(name),
          ...(prop.description ? { description: prop.description as string } : {}),
          ...(prop.default !== undefined ? { default: prop.default } : {}),
          ...(enumValues ? { enum: enumValues } : {}),
          ...(prop.format ? { format: prop.format as string } : {}),
          ...(minimum != null ? { minimum } : {}),
          ...(maximum != null ? { maximum } : {}),
          ...(nullable ? { nullable } : {}),
        };
      },
    );

    schemaCache.set(endpointId, fields);
    return fields;
  } catch {
    return [];
  }
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
 * Handles single image fields, array image fields, and the special
 * `elements` array (e.g. Kling O3).
 */
export function getSchemaImageFields(
  fields: ModelInputField[],
): DynamicImagePort[] {
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
