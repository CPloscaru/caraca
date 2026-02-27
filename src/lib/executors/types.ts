/**
 * Shared type for node executor functions.
 */

export type NodeExecutor = (
  nodeId: string,
  nodeData: Record<string, unknown>,
  inputs: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<Record<string, unknown>>;
