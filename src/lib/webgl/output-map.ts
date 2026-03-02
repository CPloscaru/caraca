import type { WebGLNodeOutput } from './types';

// ---------------------------------------------------------------------------
// Shared output map -- all WebGL generators register here, preview reads here
// ---------------------------------------------------------------------------

const outputMap = new Map<string, WebGLNodeOutput>();

/** Get the WebGL output for a given key (e.g. `${nodeId}:webgl-source-0`) */
export function getWebGLOutput(key: string): WebGLNodeOutput | undefined {
  return outputMap.get(key);
}

/** Register a WebGL output for downstream nodes to consume */
export function setWebGLOutput(key: string, output: WebGLNodeOutput): void {
  outputMap.set(key, output);
}

/** Remove a WebGL output (call on node cleanup) */
export function removeWebGLOutput(key: string): void {
  outputMap.delete(key);
}
