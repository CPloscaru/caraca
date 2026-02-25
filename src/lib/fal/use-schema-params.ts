'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchModelSchema,
  getSchemaExtraFields,
  type ModelInputField,
} from './schema-introspection';

type UseSchemaParamsResult = {
  extraFields: ModelInputField[];
  paramValues: Record<string, unknown>;
  setParam: (key: string, value: unknown) => void;
  resetParams: () => void;
};

/**
 * Hook that fetches schema for a fal.ai model, filters extra fields,
 * merges schema defaults with user overrides, and syncs to node data.
 */
export function useSchemaParams(
  nodeId: string,
  model: string,
  currentParams: Record<string, unknown> | undefined,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  excludeFields?: Set<string>,
): UseSchemaParamsResult {
  const [extraFields, setExtraFields] = useState<ModelInputField[]>([]);
  const prevModel = useRef(model);

  // Fetch schema and derive extra fields on model change
  useEffect(() => {
    let cancelled = false;
    fetchModelSchema(model).then((fields) => {
      if (cancelled) return;
      const extra = getSchemaExtraFields(fields, excludeFields);
      setExtraFields(extra);

      // Reset schemaParams when model changes (old params may not apply)
      if (prevModel.current !== model) {
        updateNodeData(nodeId, { schemaParams: undefined });
        prevModel.current = model;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [model, nodeId, updateNodeData, excludeFields]);

  // Compute merged values: schema defaults + user overrides
  const paramValues: Record<string, unknown> = {};
  for (const field of extraFields) {
    const userValue = currentParams?.[field.name];
    paramValues[field.name] =
      userValue !== undefined ? userValue : field.default;
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

  return { extraFields, paramValues, setParam, resetParams };
}
