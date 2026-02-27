import type { NodeExecutor } from './types';
import type { ImageImportData } from '@/types/canvas';

export const imageImportExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  _inputs,
  _signal,
) => {
  const data = nodeData as unknown as ImageImportData;
  if (!data.imageUrl) {
    throw new Error('No image uploaded in Image Import node');
  }
  return { 'image-source-0': data.imageUrl };
};
