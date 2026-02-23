// ---------------------------------------------------------------------------
// Model schema introspection for fal.ai video models
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
};

// Module-level cache to avoid re-fetching on every model selection
const schemaCache = new Map<string, ModelInputField[]>();

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
    const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpointId)}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const spec = (await response.json()) as Record<string, unknown>;

    // Navigate to the request body schema properties
    const paths = spec.paths as Record<string, unknown> | undefined;
    if (!paths) return [];

    const root = paths["/"] as Record<string, unknown> | undefined;
    if (!root) return [];

    const post = root.post as Record<string, unknown> | undefined;
    if (!post) return [];

    const requestBody = post.requestBody as Record<string, unknown> | undefined;
    if (!requestBody) return [];

    const content = requestBody.content as Record<string, unknown> | undefined;
    if (!content) return [];

    const jsonContent = content["application/json"] as Record<string, unknown> | undefined;
    if (!jsonContent) return [];

    const schema = jsonContent.schema as Record<string, unknown> | undefined;
    if (!schema) return [];

    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return [];

    const requiredFields = (schema.required as string[]) ?? [];

    const fields: ModelInputField[] = Object.entries(properties).map(
      ([name, prop]) => ({
        name,
        type: (prop.type as string) ?? "string",
        required: requiredFields.includes(name),
        ...(prop.description ? { description: prop.description as string } : {}),
        ...(prop.default !== undefined ? { default: prop.default } : {}),
        ...(prop.enum ? { enum: prop.enum as unknown[] } : {}),
        ...(prop.format ? { format: prop.format as string } : {}),
      }),
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

  return {
    hasPrompt: fieldMap.has("prompt"),
    hasImageUrl: fieldMap.has("image_url"),
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
  };
}
