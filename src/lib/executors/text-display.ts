import type { NodeExecutor } from './types';

export const textDisplayExecutor: NodeExecutor = async (
  _nodeId, _nodeData, inputs, _signal,
) => {
  const text = inputs['text-target-0'];
  const displayText = typeof text === 'string' ? text : '';
  return { __displayText: displayText };
};
