'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type NodeProps, Position } from '@xyflow/react';
import { Mouse, ChevronDown, ChevronRight } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { setScalarOutput, removeScalarOutput } from '@/lib/webgl/scalar-map';
import { onMouseEvent, offMouseEvent } from '@/lib/mouse-event-bus';
import type {
  ClickStateMode,
  EasingPreset,
  MouseInteractionData,
  RangeMapping,
} from '@/types/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTROL_COLOR = '#4caf50';
const CROSSHAIR_SIZE = 120;

const SCALAR_OUTPUTS = [
  { id: 'scalar-source-0', label: 'X' },
  { id: 'scalar-source-1', label: 'Y' },
  { id: 'scalar-source-2', label: 'Distance' },
  { id: 'scalar-source-3', label: 'Angle' },
  { id: 'scalar-source-4', label: 'Click' },
  { id: 'scalar-source-5', label: 'Scroll' },
  { id: 'scalar-source-6', label: 'Pinch' },
  { id: 'scalar-source-7', label: 'Rotation' },
] as const;

const DEFAULT_RANGE_MAPPINGS: Record<string, RangeMapping> = {
  X: { preset: '0-1', min: 0, max: 1 },
  Y: { preset: '0-1', min: 0, max: 1 },
  Distance: { preset: '0-1', min: 0, max: 1 },
  Angle: { preset: '0-360', min: 0, max: 360 },
};

const EASING_FACTORS: Record<EasingPreset, number> = {
  linear: 1.0,
  'ease-in': 0.05,
  'ease-out': 0.3,
  'ease-in-out': 0.15,
  spring: 0, // handled separately
};

// ---------------------------------------------------------------------------
// Smoothing helper
// ---------------------------------------------------------------------------

function mapRange(value: number, mapping: RangeMapping): number {
  // Input is always 0-1, map to desired range
  return mapping.min + value * (mapping.max - mapping.min);
}

function getRangeForPreset(preset: RangeMapping['preset']): { min: number; max: number } {
  switch (preset) {
    case '0-1': return { min: 0, max: 1 };
    case '-1-1': return { min: -1, max: 1 };
    case '0-360': return { min: 0, max: 360 };
    case 'custom': return { min: 0, max: 1 }; // custom uses stored min/max
  }
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        className="nodrag flex w-full cursor-pointer items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold text-gray-300 hover:bg-white/5"
        onClick={onToggle}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {open && <div className="mt-0.5 pl-1">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MouseInteractionNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as MouseInteractionData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // Read values with defaults
  const clickStateMode: ClickStateMode = d.clickStateMode ?? 'momentary';
  const easingPreset: EasingPreset = d.easingPreset ?? 'linear';
  const rangeMappings = d.rangeMappings ?? DEFAULT_RANGE_MAPPINGS;

  // Collapsible section state
  const [posOpen, setPosOpen] = useState(d.positionSectionOpen ?? true);
  const [gestOpen, setGestOpen] = useState(d.gesturesSectionOpen ?? false);
  const [rangeOpen, setRangeOpen] = useState(d.rangeMappingSectionOpen ?? false);
  const [smoothOpen, setSmoothOpen] = useState(d.smoothingSectionOpen ?? false);

  // Mutable refs for RAF
  const clickStateModeRef = useRef(clickStateMode);
  const easingPresetRef = useRef(easingPreset);
  const rangeMappingsRef = useRef(rangeMappings);

  // Raw target values (set by mouse event listener)
  const rawXRef = useRef(0.5);
  const rawYRef = useRef(0.5);
  const rawPressedRef = useRef(false);
  const rawScrollRef = useRef(0);
  const rawPinchRef = useRef(1.0);
  const rawRotationRef = useRef(0);

  // Smoothed values
  const smoothXRef = useRef(0.5);
  const smoothYRef = useRef(0.5);
  const smoothScrollRef = useRef(0);

  // Toggle click state
  const toggleClickRef = useRef(false);

  // Spring state for spring easing
  const springVelXRef = useRef(0);
  const springVelYRef = useRef(0);

  // DOM refs for crosshair and output labels
  const crosshairDotRef = useRef<HTMLDivElement>(null);
  const outputLabelRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Sync refs
  useEffect(() => { clickStateModeRef.current = clickStateMode; }, [clickStateMode]);
  useEffect(() => { easingPresetRef.current = easingPreset; }, [easingPreset]);
  useEffect(() => { rangeMappingsRef.current = rangeMappings; }, [rangeMappings]);

  // Mouse event listener
  useEffect(() => {
    onMouseEvent(id, (data) => {
      rawXRef.current = data.x;
      rawYRef.current = data.y;

      // Click handling
      if (clickStateModeRef.current === 'momentary') {
        rawPressedRef.current = data.pressed;
      } else {
        // Toggle: flip on press
        if (data.pressed && !rawPressedRef.current) {
          toggleClickRef.current = !toggleClickRef.current;
        }
        rawPressedRef.current = data.pressed;
      }

      // Scroll accumulation (decays in RAF)
      rawScrollRef.current += data.scrollDelta;

      // Touch gestures
      if (data.touches.length >= 2) {
        const t0 = data.touches[0];
        const t1 = data.touches[1];
        const dx = t1.x - t0.x;
        const dy = t1.y - t0.y;
        rawPinchRef.current = Math.sqrt(dx * dx + dy * dy) * 2;
        rawRotationRef.current = Math.atan2(dy, dx) * (180 / Math.PI);
      }
    });

    return () => { offMouseEvent(id); };
  }, [id]);

  // RAF registration
  useEffect(() => {
    const outputKeys = SCALAR_OUTPUTS.map(o => `${id}:${o.id}`);

    // Initialize defaults
    setScalarOutput(outputKeys[0], 0.5);
    setScalarOutput(outputKeys[1], 0.5);
    for (let i = 2; i < 8; i++) setScalarOutput(outputKeys[i], 0);

    let lastTime = 0;

    registerCallback(id, (time) => {
      const dt = lastTime === 0 ? 16.667 : time - lastTime;
      lastTime = time;

      const easing = easingPresetRef.current;
      const mappings = rangeMappingsRef.current;

      // Apply smoothing
      if (easing === 'spring') {
        const stiffness = 0.15;
        const damping = 0.7;
        springVelXRef.current += (rawXRef.current - smoothXRef.current) * stiffness;
        springVelYRef.current += (rawYRef.current - smoothYRef.current) * stiffness;
        springVelXRef.current *= damping;
        springVelYRef.current *= damping;
        smoothXRef.current += springVelXRef.current;
        smoothYRef.current += springVelYRef.current;
      } else {
        const factor = EASING_FACTORS[easing];
        const k = 1 - Math.pow(1 - factor, dt / 16.667);
        smoothXRef.current += (rawXRef.current - smoothXRef.current) * k;
        smoothYRef.current += (rawYRef.current - smoothYRef.current) * k;
      }

      // Scroll decay
      smoothScrollRef.current += (rawScrollRef.current - smoothScrollRef.current) * 0.1;
      rawScrollRef.current *= 0.95;

      // Compute derived values (always 0-1 normalized first)
      const x = smoothXRef.current;
      const y = smoothYRef.current;
      const distance = Math.min(1, Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2) * 2);
      const angleRad = Math.atan2(y - 0.5, x - 0.5);
      const angleNorm = ((angleRad * 180 / Math.PI) + 360) % 360 / 360; // 0-1

      // Apply range mappings
      const xMap = mappings.X ?? DEFAULT_RANGE_MAPPINGS.X;
      const yMap = mappings.Y ?? DEFAULT_RANGE_MAPPINGS.Y;
      const dMap = mappings.Distance ?? DEFAULT_RANGE_MAPPINGS.Distance;
      const aMap = mappings.Angle ?? DEFAULT_RANGE_MAPPINGS.Angle;

      const mappedX = mapRange(x, xMap);
      const mappedY = mapRange(y, yMap);
      const mappedDist = mapRange(distance, dMap);
      const mappedAngle = mapRange(angleNorm, aMap);

      const clickVal = clickStateModeRef.current === 'momentary'
        ? (rawPressedRef.current ? 1 : 0)
        : (toggleClickRef.current ? 1 : 0);

      const values = [
        mappedX,
        mappedY,
        mappedDist,
        mappedAngle,
        clickVal,
        smoothScrollRef.current,
        rawPinchRef.current,
        rawRotationRef.current,
      ];

      // Publish all outputs
      for (let i = 0; i < 8; i++) {
        setScalarOutput(outputKeys[i], values[i]);
      }

      // Update crosshair DOM
      if (crosshairDotRef.current) {
        crosshairDotRef.current.style.left = `${x * 100}%`;
        crosshairDotRef.current.style.top = `${y * 100}%`;
      }

      // Update output labels
      for (let i = 0; i < 8; i++) {
        const el = outputLabelRefs.current[i];
        if (el) el.textContent = values[i].toFixed(2);
      }
    });

    return () => {
      unregisterCallback(id);
      for (const key of outputKeys) removeScalarOutput(key);
    };
  }, [id]);

  // UI callbacks
  const handleChange = useCallback(
    (field: string, value: unknown) => {
      updateNodeData(id, { [field]: value });
    },
    [id, updateNodeData],
  );

  const handleRangeMappingChange = useCallback(
    (outputName: string, update: Partial<RangeMapping>) => {
      const current = rangeMappings[outputName] ?? DEFAULT_RANGE_MAPPINGS[outputName];
      const newMapping = { ...current, ...update };
      // When preset changes, update min/max to match
      if (update.preset && update.preset !== 'custom') {
        const range = getRangeForPreset(update.preset);
        newMapping.min = range.min;
        newMapping.max = range.max;
      }
      updateNodeData(id, {
        rangeMappings: { ...rangeMappings, [outputName]: newMapping },
      });
    },
    [id, rangeMappings, updateNodeData],
  );

  // Compute port positions spread across the node height
  const portSpacing = 100 / (SCALAR_OUTPUTS.length + 1);

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 240,
        maxWidth: 280,
        position: 'relative',
        boxShadow: selected
          ? `0 0 0 2px ${CONTROL_COLOR}, 0 0 12px rgba(76, 175, 80, 0.3)`
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          userSelect: 'none',
        }}
      >
        <Mouse size={14} color={CONTROL_COLOR} />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500, flex: 1 }}>
          Mouse Interaction
        </span>
      </div>

      {/* Mini Crosshair Visualization */}
      <div
        className="nodrag"
        style={{
          width: CROSSHAIR_SIZE,
          height: CROSSHAIR_SIZE,
          background: '#111',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 8,
          border: '1px solid #333',
          margin: '0 auto 8px',
        }}
      >
        {/* Grid lines */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#2a2a2a' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#2a2a2a' }} />
        {/* Crosshair dot */}
        <div
          ref={crosshairDotRef}
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: CONTROL_COLOR,
            boxShadow: `0 0 6px ${CONTROL_COLOR}80`,
            transform: 'translate(-50%, -50%)',
            left: '50%',
            top: '50%',
            transition: 'none',
          }}
        />
      </div>

      {/* Position Section */}
      <Section
        title="Position"
        open={posOpen}
        onToggle={() => {
          setPosOpen(v => !v);
          handleChange('positionSectionOpen', !posOpen);
        }}
      >
        <div className="space-y-0.5 text-[10px] text-gray-400">
          <div className="flex justify-between">
            <span>X</span>
            <span ref={el => { outputLabelRefs.current[0] = el; }} className="tabular-nums">0.50</span>
          </div>
          <div className="flex justify-between">
            <span>Y</span>
            <span ref={el => { outputLabelRefs.current[1] = el; }} className="tabular-nums">0.50</span>
          </div>
          <div className="mt-1 text-[9px] text-gray-500">Move cursor over Preview node</div>
        </div>
      </Section>

      {/* Gestures Section */}
      <Section
        title="Gestures"
        open={gestOpen}
        onToggle={() => {
          setGestOpen(v => !v);
          handleChange('gesturesSectionOpen', !gestOpen);
        }}
      >
        <div className="mb-1.5">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
            Click Mode
          </span>
          <select
            className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
            value={clickStateMode}
            onChange={e => handleChange('clickStateMode', e.target.value)}
          >
            <option value="momentary">Momentary</option>
            <option value="toggle">Toggle</option>
          </select>
        </div>
        <div className="space-y-0.5 text-[10px] text-gray-400">
          <div className="flex justify-between">
            <span>Pinch</span>
            <span ref={el => { outputLabelRefs.current[6] = el; }} className="tabular-nums">1.00</span>
          </div>
          <div className="flex justify-between">
            <span>Rotation</span>
            <span ref={el => { outputLabelRefs.current[7] = el; }} className="tabular-nums">0.00</span>
          </div>
        </div>
        <div className="mt-1 text-[9px] text-gray-500">2-finger gestures on touch devices</div>
      </Section>

      {/* Range Mapping Section */}
      <Section
        title="Range Mapping"
        open={rangeOpen}
        onToggle={() => {
          setRangeOpen(v => !v);
          handleChange('rangeMappingSectionOpen', !rangeOpen);
        }}
      >
        {(['X', 'Y', 'Distance', 'Angle'] as const).map(name => {
          const mapping = rangeMappings[name] ?? DEFAULT_RANGE_MAPPINGS[name];
          return (
            <div key={name} className="mb-1.5">
              <span className="mb-0.5 block text-[10px] font-medium text-gray-400">{name}</span>
              <select
                className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-200 outline-none focus:border-white/20"
                value={mapping.preset}
                onChange={e => handleRangeMappingChange(name, { preset: e.target.value as RangeMapping['preset'] })}
              >
                <option value="0-1">0 ... 1</option>
                <option value="-1-1">-1 ... 1</option>
                <option value="0-360">0 ... 360</option>
                <option value="custom">Custom</option>
              </select>
              {mapping.preset === 'custom' && (
                <div className="mt-0.5 flex items-center gap-1">
                  <input
                    type="number"
                    className="nodrag nowheel w-14 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-gray-300 outline-none"
                    value={mapping.min}
                    onChange={e => handleRangeMappingChange(name, { min: Number(e.target.value) })}
                  />
                  <span className="text-[9px] text-gray-500">to</span>
                  <input
                    type="number"
                    className="nodrag nowheel w-14 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-gray-300 outline-none"
                    value={mapping.max}
                    onChange={e => handleRangeMappingChange(name, { max: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* Smoothing Section */}
      <Section
        title="Smoothing"
        open={smoothOpen}
        onToggle={() => {
          setSmoothOpen(v => !v);
          handleChange('smoothingSectionOpen', !smoothOpen);
        }}
      >
        <div className="mb-1.5">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
            Easing
          </span>
          <select
            className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
            value={easingPreset}
            onChange={e => handleChange('easingPreset', e.target.value)}
          >
            <option value="linear">Linear (none)</option>
            <option value="ease-in">Ease In</option>
            <option value="ease-out">Ease Out</option>
            <option value="ease-in-out">Ease In-Out</option>
            <option value="spring">Spring</option>
          </select>
        </div>
      </Section>

      {/* Scalar Output Ports with live values */}
      <div className="mt-2 space-y-1">
        {SCALAR_OUTPUTS.map((output, i) => (
          <div key={output.id} style={{ position: 'relative', height: 16 }}>
            <span
              className="pointer-events-none absolute text-[9px] text-gray-400"
              style={{ right: 4, top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}
            >
              {output.label}: <span ref={el => { outputLabelRefs.current[i] = el; }} className="tabular-nums">
                {i < 2 ? '0.50' : i === 6 ? '1.00' : '0.00'}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Output handles positioned along right edge */}
      {SCALAR_OUTPUTS.map((output, i) => (
        <TypedHandle
          key={output.id}
          type="source"
          position={Position.Right}
          portType="scalar"
          portId={output.id}
          handleId={`scalar-source-${i}`}
          index={i}
          style={{ top: `${(i + 1) * portSpacing}%` }}
        />
      ))}
    </div>
  );
}

export const MouseInteractionNode = withNodeErrorBoundary(MouseInteractionNodeInner);
export default MouseInteractionNode;
