import type { Connection } from '@xyflow/react';

export const PORT_TYPES = {
  image: { color: '#2a8af6', label: 'Image' },
  text: { color: '#ae53ba', label: 'Text' },
  mask: { color: '#e92a67', label: 'Mask' },
  model: { color: '#22c55e', label: 'Model' },
} as const;

export type PortType = keyof typeof PORT_TYPES;

/** Compatibility map: which output types can connect to which input types */
export const COMPATIBLE_PORTS: Record<PortType, PortType[]> = {
  image: ['image'],
  text: ['text'],
  mask: ['mask'],
  model: ['model'],
};

/**
 * Parse port type from handle ID.
 * Handle ID convention: "{portType}-{direction}-{index}"
 * e.g. "image-source-0", "text-target-1"
 */
export function getPortTypeFromHandleId(handleId: string | null): PortType | null {
  if (!handleId) return null;
  const type = handleId.split('-')[0];
  return type in PORT_TYPES ? (type as PortType) : null;
}

/** Validate whether a connection between two ports is allowed */
export function isValidConnection(connection: Connection): boolean {
  const sourceType = getPortTypeFromHandleId(connection.sourceHandle ?? null);
  const targetType = getPortTypeFromHandleId(connection.targetHandle ?? null);
  if (!sourceType || !targetType) return false;
  return COMPATIBLE_PORTS[sourceType].includes(targetType);
}
