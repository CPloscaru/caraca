'use client';

import type { CSSProperties } from 'react';
import { Handle, type HandleProps } from '@xyflow/react';
import { PORT_TYPES, type PortType } from '@/lib/port-types';

type TypedHandleProps = Omit<HandleProps, 'id'> & {
  portType: PortType;
  portId: string;
  index: number;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TypedHandle({ portType, portId, index,
  type,
  position,
  ...rest
}: TypedHandleProps) {
  const direction = type === 'source' ? 'source' : 'target';
  const id = `${portType}-${direction}-${index}`;
  const color = PORT_TYPES[portType].color;

  return (
    <Handle
      {...rest}
      id={id}
      type={type}
      position={position}
      style={{
        ...(rest as Record<string, unknown>).style as CSSProperties | undefined,
        width: 12,
        height: 12,
        borderRadius: '50%',
        backgroundColor: color,
        border: `2px solid ${color}`,
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.boxShadow = `0 0 6px ${color}`;
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.boxShadow = 'none';
      }}
    />
  );
}
