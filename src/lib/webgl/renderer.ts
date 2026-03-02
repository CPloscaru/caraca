import * as THREE from 'three';

let renderer: THREE.WebGLRenderer | null = null;
let refCount = 0;

/**
 * Acquire the shared WebGLRenderer singleton.
 * Lazy-creates on first call. Increments ref count.
 * Call releaseRenderer() when done to allow disposal.
 */
export function acquireRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.autoClear = false;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[webgl] Context lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.info('[webgl] Context restored');
    });
  }
  refCount++;
  return renderer;
}

/**
 * Release a reference to the shared WebGLRenderer.
 * When ref count hits 0, the renderer is disposed and the
 * WebGL context is force-released back to the browser.
 */
export function releaseRenderer(): void {
  refCount--;
  if (refCount <= 0) {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
    refCount = 0;
  }
}
