/**
 * WebGL module public barrel.
 *
 * Only type re-exports are included here. Runtime modules (renderer,
 * render-target-pool, dynamic) are intentionally excluded because they
 * import Three.js at the top level, which crashes SSR. Consumer code
 * that needs runtime exports should import directly from the specific
 * file (e.g. '@/lib/webgl/renderer') inside an SSR-guarded context.
 */
export type { WebGLNodeOutput, RenderCallback } from './types';
