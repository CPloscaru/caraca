import * as THREE from 'three';

type PoolKey = `${number}x${number}`;

const pool = new Map<PoolKey, THREE.WebGLRenderTarget[]>();
const inUse = new Set<THREE.WebGLRenderTarget>();

function getKey(w: number, h: number): PoolKey {
  return `${w}x${h}`;
}

/**
 * Check out a render target of the given resolution.
 * Reuses an available target from the pool or creates a new one.
 */
export function checkout(width: number, height: number): THREE.WebGLRenderTarget {
  const key = getKey(width, height);
  const bucket = pool.get(key) ?? [];
  const available = bucket.find((rt) => !inUse.has(rt));
  if (available) {
    inUse.add(available);
    return available;
  }
  const rt = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  bucket.push(rt);
  pool.set(key, bucket);
  inUse.add(rt);
  return rt;
}

/** Return a render target to the pool for reuse. */
export function checkin(rt: THREE.WebGLRenderTarget): void {
  inUse.delete(rt);
}

/** Dispose all pooled render targets and clear the pool. */
export function disposeAll(): void {
  for (const bucket of pool.values()) {
    for (const rt of bucket) {
      rt.dispose();
    }
  }
  pool.clear();
  inUse.clear();
}
