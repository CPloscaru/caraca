import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

/**
 * Dynamically import a WebGL node component with SSR disabled.
 * All WebGL components must be imported through this wrapper
 * to prevent Three.js from being bundled in the server build.
 *
 * Usage:
 *   const MyNode = webglDynamic(() => import('@/components/canvas/nodes/webgl/MyNode'));
 */
export function webglDynamic<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
) {
  return dynamic(importFn, { ssr: false });
}
