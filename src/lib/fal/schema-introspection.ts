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

        return {
          name,
          type: fieldType ?? "string",
          required: requiredFields.includes(name),
          ...(prop.description ? { description: prop.description as string } : {}),
          ...(prop.default !== undefined ? { default: prop.default } : {}),
          ...(enumValues ? { enum: enumValues } : {}),
          ...(prop.format ? { format: prop.format as string } : {}),
        };
      },
    );

    schemaCache.set(endpointId, fields);
    return fields;
  } catch {
    return [];
  }
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
