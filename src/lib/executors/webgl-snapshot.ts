import type { NodeExecutor } from './types';
import type { WebGLSnapshotData } from '@/types/canvas';

export const webglSnapshotExecutor: NodeExecutor = async (
  _nodeId,
  nodeData,
  _inputs,
  _signal,
) => {
  const data = nodeData as unknown as WebGLSnapshotData;
  if (!data.capturedImageUrl) {
    return { __error: 'No frame captured' };
  }
  return { 'image-source-0': data.capturedImageUrl };
};
