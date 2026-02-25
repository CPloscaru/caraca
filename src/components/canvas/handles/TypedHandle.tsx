'use client';

import type { CSSProperties } from 'react';
import { Handle, type HandleProps } from '@xyflow/react';
import { PORT_TYPES, type PortType } from '@/lib/port-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type TypedHandleProps = Omit<HandleProps, 'id' | 'isConnectable'> & {
  portType: PortType;
  portId: string;
  index: number;
  /** Explicit handle ID override (for dynamic ports using field-name-based IDs) */
  handleId?: string;
  /** Text label displayed adjacent to the handle */
  label?: string;
  /** Shows a colored ring when the required port is not connected */
  required?: boolean;
  /** Max connections allowed (passed through to Handle) */
  isConnectable?: number;
  /** Small badge text near the handle (e.g. "2/3") */
  badgeText?: string;
  /** Rich tooltip shown on hover */
  tooltip?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TypedHandle({ portType, portId, index,
  type,
  position,
  handleId,
  label,
  required,
  isConnectable,
  badgeText,
  tooltip,
  ...rest
}: TypedHandleProps) {
  const direction = type === 'source' ? 'source' : 'target';
  const id = handleId ?? `${portType}-${direction}-${index}`;
  const color = PORT_TYPES[portType].color;
  const isTarget = type === 'target';

  const handleElement = (
    <Handle
      {...rest}
      id={id}
      type={type}
      position={position}
      isConnectable={isConnectable as unknown as boolean | undefined}
      style={{
        ...(rest as Record<string, unknown>).style as CSSProperties | undefined,
        width: 12,
        height: 12,
        borderRadius: '50%',
        backgroundColor: color,
        border: required ? `2px solid #f59e0b` : `2px solid ${color}`,
        boxShadow: required ? `0 0 4px #f59e0b80` : undefined,
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.boxShadow = `0 0 6px ${color}`;
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.boxShadow = required
          ? `0 0 4px #f59e0b80`
          : 'none';
      }}
    />
  );

  // If no label, badge, or tooltip — return simple handle
  if (!label && !badgeText && !tooltip) {
    return handleElement;
  }

  const content = (
    <div className="relative flex items-center" style={{ pointerEvents: 'none' }}>
      {handleElement}
      {label && (
        <span
          className="pointer-events-none absolute whitespace-nowrap text-[9px] text-gray-400"
          style={isTarget ? { left: 18 } : { right: 18 }}
        >
          {label}
        </span>
      )}
      {badgeText && (
        <span
          className="pointer-events-none absolute whitespace-nowrap rounded bg-white/10 px-1 text-[8px] text-gray-400"
          style={isTarget ? { left: 18, top: 12 } : { right: 18, top: 12 }}
        >
          {badgeText}
        </span>
      )}
    </div>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="pointer-events-auto">{content}</div>
          </TooltipTrigger>
          <TooltipContent side={isTarget ? 'left' : 'right'}>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
