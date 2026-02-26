// ---------------------------------------------------------------------------
// Recursive Schema Tree Engine
// Parses fal.ai OpenAPI schemas into a recursive tree of SchemaNode objects.
// Handles $ref resolution, anyOf unwrapping, nested objects, and arrays.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SchemaNodeKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'enum'
  | 'unknown';

/**
 * A node in the recursive schema tree.
 * Leaf nodes represent scalar fields; branch nodes contain children (object)
 * or an itemSchema (array).
 */
export type SchemaNode = {
  /** Dot-path from root (e.g. "elements.0.frontal_image_url") */
  path: string;
  /** Last segment of path (the property name) */
  name: string;
  kind: SchemaNodeKind;
  required: boolean;
  description?: string;
  default?: unknown;
  nullable: boolean;

  // Scalar constraints
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;

  // Object children (kind === 'object')
  children?: SchemaNode[];

  // Array item schema (kind === 'array')
  itemSchema?: SchemaNode;
  minItems?: number;
  maxItems?: number;

  // UI hint from fal.ai `x-fal-*` or `ui.field` annotations
  uiHint?: string;
};

/**
 * Result of parsing a full model schema.
 * Contains the tree (root children) plus a flat list for backward compatibility.
 */
export type SchemaTreeResult = {
  /** Top-level fields as tree nodes */
  root: SchemaNode[];
  /** Flat list of all top-level fields as ModelInputField (backward-compat) */
  flatFields: FlatField[];
};

/** Backward-compatible flat field representation */
export type FlatField = {
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

// ---------------------------------------------------------------------------
// Internal types for raw OpenAPI JSON
// ---------------------------------------------------------------------------

type RawSchema = Record<string, unknown>;
type RawSpec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// $ref resolution (depth-limited with circular ref detection)
// ---------------------------------------------------------------------------

const MAX_REF_DEPTH = 10;

function resolveRef(spec: RawSpec, ref: string): RawSchema | undefined {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as RawSchema)[part];
  }
  return current as RawSchema | undefined;
}

/** Recursively resolve a schema, following $ref pointers. */
function resolve(
  spec: RawSpec,
  schema: RawSchema,
  depth: number = 0,
  visited: Set<string> = new Set(),
): RawSchema {
  if (depth >= MAX_REF_DEPTH) return schema;
  if (schema.$ref && typeof schema.$ref === 'string') {
    if (visited.has(schema.$ref)) return schema; // Circular ref detected
    visited.add(schema.$ref);
    const resolved = resolveRef(spec, schema.$ref);
    if (resolved) return resolve(spec, resolved, depth + 1, visited);
  }
  return schema;
}

// ---------------------------------------------------------------------------
// anyOf / allOf unwrapping
// ---------------------------------------------------------------------------

type UnwrapResult = {
  type?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  nullable: boolean;
  resolved?: RawSchema; // The non-null, non-trivial variant (for complex types)
};

/**
 * Unwrap anyOf/allOf to extract type info, enum, constraints, and nullable.
 * Resolves $ref inside variants.
 */
function unwrapVariants(
  spec: RawSpec,
  schema: RawSchema,
  depth: number = 0,
  visited: Set<string> = new Set(),
): UnwrapResult {
  const variants = (
    (schema.anyOf as RawSchema[] | undefined) ??
    (schema.allOf as RawSchema[] | undefined)
  );
  if (!variants) return { nullable: false };

  let type: string | undefined;
  let enumValues: unknown[] | undefined;
  let minimum: number | undefined;
  let maximum: number | undefined;
  let nullable = false;
  let resolved: RawSchema | undefined;

  for (const rawVariant of variants) {
    const v = resolve(spec, rawVariant, depth, visited);

    if (v.type === 'null') {
      nullable = true;
      continue;
    }

    if (!type && typeof v.type === 'string') type = v.type as string;
    if (!enumValues && Array.isArray(v.enum)) enumValues = v.enum as unknown[];
    if (minimum == null && typeof v.minimum === 'number') minimum = v.minimum as number;
    if (maximum == null && typeof v.maximum === 'number') maximum = v.maximum as number;

    // Keep the richest non-null variant for further parsing (objects/arrays)
    if (!resolved && v.type !== 'null') {
      resolved = v;
    }
  }

  return { type, enum: enumValues, minimum, maximum, nullable, resolved };
}

// ---------------------------------------------------------------------------
// Recursive parser
// ---------------------------------------------------------------------------

function parseProperty(
  spec: RawSpec,
  name: string,
  rawProp: RawSchema,
  parentPath: string,
  requiredSet: Set<string>,
  depth: number = 0,
  visited: Set<string> = new Set(),
): SchemaNode {
  const prop = resolve(spec, rawProp, depth, visited);
  const path = parentPath ? `${parentPath}.${name}` : name;

  // Unwrap anyOf/allOf
  const unwrapped = unwrapVariants(spec, prop, depth, visited);

  // Determine effective type and effective prop to use for items/properties.
  // When prop is an anyOf wrapper (no own type), switch to the resolved variant
  // so we can access items, properties, etc.
  const propType = prop.type as string | undefined;
  let effectiveProp = prop;

  if (!propType && unwrapped.resolved) {
    effectiveProp = unwrapped.resolved;
  }

  const effectiveType = propType ?? unwrapped.type ?? (effectiveProp.type as string | undefined);

  // Extract enum
  const enumValues = (prop.enum as unknown[] | undefined) ?? unwrapped.enum;

  // Extract constraints
  const minimum = (prop.minimum as number | undefined) ?? unwrapped.minimum;
  const maximum = (prop.maximum as number | undefined) ?? unwrapped.maximum;
  const nullable = unwrapped.nullable || (prop.nullable === true);

  // UI hints from fal.ai extensions (check both original prop and effective prop)
  const uiHint =
    (prop['x-fal-widget'] as string | undefined) ??
    ((prop.ui as RawSchema | undefined)?.field as string | undefined) ??
    (effectiveProp['x-fal-widget'] as string | undefined) ??
    ((effectiveProp.ui as RawSchema | undefined)?.field as string | undefined) ??
    (effectiveProp['_fal_ui_field'] as string | undefined);

  // Determine kind
  let kind: SchemaNodeKind;
  if (enumValues && enumValues.length > 0) {
    kind = 'enum';
  } else if (effectiveType === 'object' || effectiveProp.properties) {
    kind = 'object';
  } else if (effectiveType === 'array' || effectiveProp.items) {
    kind = 'array';
  } else if (effectiveType === 'string') {
    kind = 'string';
  } else if (effectiveType === 'number') {
    kind = 'number';
  } else if (effectiveType === 'integer') {
    kind = 'integer';
  } else if (effectiveType === 'boolean') {
    kind = 'boolean';
  } else {
    kind = 'unknown';
  }

  const node: SchemaNode = {
    path,
    name,
    kind,
    required: requiredSet.has(name),
    nullable,
    ...(prop.description ? { description: prop.description as string } : {}),
    ...(prop.default !== undefined ? { default: prop.default } : {}),
    ...(enumValues ? { enum: enumValues } : {}),
    ...(prop.format ? { format: prop.format as string } : {}),
    ...(minimum != null ? { minimum } : {}),
    ...(maximum != null ? { maximum } : {}),
    ...(uiHint ? { uiHint } : {}),
  };

  // Recurse into object children
  if (kind === 'object') {
    const properties = (effectiveProp.properties as Record<string, RawSchema>) ?? {};
    const childRequired = new Set<string>(
      (effectiveProp.required as string[] | undefined) ?? [],
    );
    node.children = Object.entries(properties).map(([childName, childProp]) =>
      parseProperty(spec, childName, childProp, path, childRequired, depth + 1, visited),
    );
  }

  // Recurse into array items
  if (kind === 'array') {
    const rawItems = effectiveProp.items as RawSchema | undefined;
    if (rawItems) {
      const itemResolved = resolve(spec, rawItems, depth, visited);
      node.itemSchema = parseProperty(spec, '0', itemResolved, path, new Set(), depth + 1, visited);
    }
    if (typeof effectiveProp.minItems === 'number') node.minItems = effectiveProp.minItems as number;
    if (typeof effectiveProp.maxItems === 'number') node.maxItems = effectiveProp.maxItems as number;
  }

  return node;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the POST request body schema from an OpenAPI spec.
 */
function findPostRequestBody(spec: RawSpec): RawSchema | undefined {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return undefined;

  for (const pathObj of Object.values(paths)) {
    const post = pathObj?.post as RawSchema | undefined;
    if (!post?.requestBody) continue;

    const requestBody = post.requestBody as RawSchema;
    const content = requestBody.content as Record<string, RawSchema> | undefined;
    if (!content) continue;

    const jsonContent = content['application/json'];
    if (!jsonContent) continue;

    let schema = jsonContent.schema as RawSchema | undefined;
    if (!schema) continue;

    schema = resolve(spec, schema);
    if (schema?.properties) return schema;
  }

  return undefined;
}

/**
 * Parse a full OpenAPI spec into a SchemaTreeResult.
 * Returns both the recursive tree and a flat field list for backward compatibility.
 */
export function parseSchemaTree(spec: RawSpec): SchemaTreeResult | null {
  const schema = findPostRequestBody(spec);
  if (!schema) return null;

  const properties = schema.properties as Record<string, RawSchema> | undefined;
  if (!properties) return null;

  const requiredSet = new Set<string>(
    (schema.required as string[] | undefined) ?? [],
  );

  const root: SchemaNode[] = Object.entries(properties).map(
    ([name, prop]) => parseProperty(spec, name, prop, '', requiredSet),
  );

  // Generate flat fields for backward compatibility
  const flatFields: FlatField[] = root.map(nodeToFlatField);

  return { root, flatFields };
}

/** Convert a SchemaNode to a FlatField (backward-compatible ModelInputField shape). */
function nodeToFlatField(node: SchemaNode): FlatField {
  const type = node.kind === 'enum'
    ? (node.enum?.every(v => typeof v === 'number') ? 'number' : 'string')
    : node.kind === 'unknown' ? 'string' : node.kind;

  return {
    name: node.name,
    type,
    required: node.required,
    ...(node.description ? { description: node.description } : {}),
    ...(node.default !== undefined ? { default: node.default } : {}),
    ...(node.enum ? { enum: node.enum } : {}),
    ...(node.format ? { format: node.format } : {}),
    ...(node.minimum != null ? { minimum: node.minimum } : {}),
    ...(node.maximum != null ? { maximum: node.maximum } : {}),
    ...(node.nullable ? { nullable: node.nullable } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tree traversal utilities
// ---------------------------------------------------------------------------

/** Find a node by dot-path in the tree. */
export function findNode(root: SchemaNode[], path: string): SchemaNode | undefined {
  const segments = path.split('.');
  let nodes = root;
  let current: SchemaNode | undefined;

  for (const seg of segments) {
    current = nodes.find(n => n.name === seg);
    if (!current) return undefined;

    if (current.kind === 'object' && current.children) {
      nodes = current.children;
    } else if (current.kind === 'array' && current.itemSchema) {
      nodes = current.itemSchema.children ?? [current.itemSchema];
    } else {
      nodes = [];
    }
  }

  return current;
}

/** Collect all leaf nodes (scalars) from the tree. */
export function collectLeaves(root: SchemaNode[]): SchemaNode[] {
  const leaves: SchemaNode[] = [];

  function walk(nodes: SchemaNode[]) {
    for (const node of nodes) {
      if (node.kind === 'object' && node.children) {
        walk(node.children);
      } else if (node.kind === 'array' && node.itemSchema?.children) {
        walk(node.itemSchema.children);
      } else {
        leaves.push(node);
      }
    }
  }

  walk(root);
  return leaves;
}
