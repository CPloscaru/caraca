/**
 * WebGL module public barrel.
 *
 * Type re-exports are always safe. The animation-loop module is also
 * re-exported because it has no Three.js or browser-API imports at the
 * top level (RAF is only called inside functions).
 *
 * Runtime modules that import Three.js (renderer, render-target-pool,
 * dynamic) are intentionally excluded — they crash SSR. Consumer code
 * should import those directly inside SSR-guarded contexts.
 */
export type { WebGLNodeOutput, RenderCallback } from './types';
export { registerCallback, unregisterCallback } from './animation-loop';
