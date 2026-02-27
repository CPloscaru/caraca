import type { NodeExecutor } from './types';
import type { TextInputData } from '@/types/canvas';

export const textInputExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  _inputs,
  _signal,
) => {
  const data = nodeData as unknown as TextInputData;
  return { 'text-source-0': data.value ?? '' };
};
