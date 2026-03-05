'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchModelSchema,
  getSchemaExtraFields,
  type ModelInputField,
} from './schema-introspection';
import { fetchSchemaTree } from './schema-introspection';
import { useAppStore } from '@/stores/app-store';
import type { SchemaNode } from './schema-tree';

/** Fields with dedicated UI — excluded from the generic tree rendering. */
const DEDICATED_FIELDS = new Set([
  'prompt',
  'sync_mode',
  'enable_safety_checker',
  'image_size',
  'aspect_ratio',
  'duration',
  'num_images',
]);

type UseSchemaParamsResult = {
  extraFields: ModelInputField[];
  paramValues: Record<string, unknown>;
  setParam: (key: string, value: unknown) => void;
  resetParams: () => void;
  /** Filtered schema tree (dedicated fields excluded) for tree-based rendering. */
  filteredTree: SchemaNode[];
};

/**
 * Hook that fetches schema for a fal.ai model, filters extra fields,
 * merges schema defaults with user overrides, and syncs to node data.
 * Also returns a filtered schema tree for unified tree-based rendering.
 *
 * Manages a global loading overlay via appStore while the schema is being
 * fetched and the UI is settling.
 */
export function useSchemaParams(
  nodeId: string,
  model: string,
  currentParams: Record<string, unknown> | undefined,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  excludeFields?: Set<string>,
): UseSchemaParamsResult {
  const [extraFields, setExtraFields] = useState<ModelInputField[]>([]);
  const [filteredTree, setFilteredTree] = useState<SchemaNode[]>([]);
  const prevModel = useRef(model);

  const startSchemaLoading = useAppStore((s) => s.startSchemaLoading);
  const stopSchemaLoading = useAppStore((s) => s.stopSchemaLoading);

  // Track whether this hook instance owns a loading increment
  const ownsLoading = useRef(false);

  // Build combined exclusion set (memoized to keep effect deps stable)
  const allExcluded = useMemo(
    () =>
      excludeFields
        ? new Set([...DEDICATED_FIELDS, ...excludeFields])
        : DEDICATED_FIELDS,
    [excludeFields],
  );

  // Fetch schema and derive extra fields + tree on model change
  useEffect(() => {
    let cancelled = false;

    startSchemaLoading();
    ownsLoading.current = true;

    Promise.all([fetchModelSchema(model), fetchSchemaTree(model)]).then(([fields, tree]) => {
      if (cancelled) return;
      const extra = getSchemaExtraFields(fields, excludeFields);
      setExtraFields(extra);

      // Filter tree: exclude dedicated fields
      const filtered = tree.filter((n) => !allExcluded.has(n.name));
      setFilteredTree(filtered);

      // Reset schemaParams when model changes, seeding with schema defaults
      // so the executor always has the full param set.
      if (prevModel.current !== model) {
        const defaults: Record<string, unknown> = {};
        for (const f of extra) {
          if (f.default !== undefined) defaults[f.name] = f.default;
        }
        // Seed from full tree (including dedicated fields) so the executor
        // always has values for aspect_ratio, image_size, etc.
        for (const n of tree) {
          if (defaults[n.name] !== undefined) continue;
          if (n.default !== undefined) {
            defaults[n.name] = n.default;
          } else if (n.kind === 'enum' && n.enum && n.enum.length > 0) {
            defaults[n.name] = n.enum[0];
          } else if (n.kind === 'boolean') {
            defaults[n.name] = false;
          }
        }
        updateNodeData(nodeId, {
          schemaParams: Object.keys(defaults).length > 0 ? defaults : undefined,
        });
        prevModel.current = model;
      }
    });
    return () => {
      cancelled = true;
      if (ownsLoading.current) {
        stopSchemaLoading();
        ownsLoading.current = false;
      }
    };
  }, [model, nodeId, updateNodeData, startSchemaLoading, stopSchemaLoading, allExcluded, excludeFields]);

  // Dismiss loading overlay once filteredTree is rendered (post-paint)
  useEffect(() => {
    if (!ownsLoading.current || filteredTree.length === 0) return;
    // Wait 2 frames: 1st for React commit, 2nd for browser paint
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (ownsLoading.current) {
          stopSchemaLoading();
          ownsLoading.current = false;
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [filteredTree, stopSchemaLoading]);

  // Compute merged values: all user overrides + schema defaults for scalars
  const paramValues: Record<string, unknown> = {};
  // Include ALL currentParams (needed for complex types like arrays/objects in the tree)
  if (currentParams) {
    Object.assign(paramValues, currentParams);
  }
  // Overlay schema defaults for scalar extra fields not yet set by user
  for (const field of extraFields) {
    if (paramValues[field.name] === undefined && field.default !== undefined) {
      paramValues[field.name] = field.default;
    }
  }

  const setParam = useCallback(
    (key: string, value: unknown) => {
      const next = { ...(currentParams ?? {}), [key]: value };
      updateNodeData(nodeId, { schemaParams: next });
    },
    [nodeId, currentParams, updateNodeData],
  );

  const resetParams = useCallback(() => {
    updateNodeData(nodeId, { schemaParams: undefined });
  }, [nodeId, updateNodeData]);

  return { extraFields, paramValues, setParam, resetParams, filteredTree };
}
