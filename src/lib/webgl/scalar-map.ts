// ---------------------------------------------------------------------------
// Shared scalar output map -- control nodes register here, consumers read here
// ---------------------------------------------------------------------------

const scalarMap = new Map<string, number>();

/** Get the scalar output for a given key (e.g. `${nodeId}:scalar-source-0`) */
export function getScalarOutput(key: string): number | undefined {
  return scalarMap.get(key);
}

/** Register a scalar output for downstream nodes to consume */
export function setScalarOutput(key: string, value: number): void {
  scalarMap.set(key, value);
}

/** Remove a scalar output (call on node cleanup) */
export function removeScalarOutput(key: string): void {
  scalarMap.delete(key);
}
