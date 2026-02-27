import type { NodeExecutor } from './types';

// Batch parameter is a data provider — passthrough its first value during single-node DAG runs
export const batchParameterExecutor: NodeExecutor = async (_nodeId, nodeData) => {
  const values = (nodeData.values as string[]) ?? [];
  return { text: values[0] ?? '' };
};
