'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type NodeProps, Position } from '@xyflow/react';
import { Clock, Play, Pause, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { setScalarOutput, removeScalarOutput } from '@/lib/webgl/scalar-map';
import type { LoopMode, TimeControlData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTROL_COLOR = '#4caf50';
const TIMELINE_WIDTH = 200;
const TIMELINE_HEIGHT = 24;

// ---------------------------------------------------------------------------
// Slider helper (same pattern as other WebGL nodes)
// ---------------------------------------------------------------------------

const SLIDER_CLS =
  'nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-green-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-400';

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="mb-1.5">
      <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className={SLIDER_CLS}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="w-14 text-right text-[10px] tabular-nums text-gray-300">
          {value.toFixed(step < 1 ? 1 : 0)}{suffix ?? ''}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section (same pattern as ColorCorrectionNode)
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
// Segmented control
// ---------------------------------------------------------------------------

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="nodrag flex gap-0.5 rounded bg-white/5 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`flex-1 cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            value === opt.value
              ? 'bg-green-600/40 text-green-300'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speed presets
// ---------------------------------------------------------------------------

const SPEED_PRESETS = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TimeControlNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as TimeControlData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // Read values with defaults
  const speed = d.speed ?? 1;
  const loopMode = (d.loopMode ?? 'loop') as LoopMode;
  const timeRangeStart = d.timeRangeStart ?? 0;
  const timeRangeEnd = d.timeRangeEnd ?? 10;
  const isPlaying = d.isPlaying ?? true;

  // Mutable refs for RAF (never read node data in RAF)
  const speedRef = useRef(speed);
  const loopModeRef = useRef(loopMode);
  const rangeStartRef = useRef(timeRangeStart);
  const rangeEndRef = useRef(timeRangeEnd);
  const isPlayingRef = useRef(isPlaying);

  // Internal timing state (not persisted to node data)
  const internalTimeRef = useRef(0); // accumulated internal time in seconds
  const lastRafTimeRef = useRef<number | null>(null); // last RAF timestamp (ms)
  const frozenValueRef = useRef(timeRangeStart); // value when paused

  // DOM refs for direct updates (no setState in RAF)
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const outputDisplayRef = useRef<HTMLSpanElement>(null);

  // Sync refs from data
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { loopModeRef.current = loopMode; }, [loopMode]);
  useEffect(() => { rangeStartRef.current = timeRangeStart; }, [timeRangeStart]);
  useEffect(() => { rangeEndRef.current = timeRangeEnd; }, [timeRangeEnd]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Collapsible section state
  const [speedOpen, setSpeedOpen] = useState(true);
  const [loopOpen, setLoopOpen] = useState(true);
  const [rangeOpen, setRangeOpen] = useState(d.positionSectionOpen ?? true);

  // Compute transformed time from internal accumulated time
  const computeTransformedTime = useCallback((rawT: number) => {
    const start = rangeStartRef.current;
    const end = rangeEndRef.current;
    const duration = Math.max(end - start, 0.001);
    const mode = loopModeRef.current;

    if (mode === 'loop') {
      return start + ((rawT % duration) + duration) % duration;
    }
    if (mode === 'ping-pong') {
      return start + duration * (1 - Math.abs(((rawT / duration) % 2) - 1));
    }
    // once
    return Math.min(start + rawT, end);
  }, []);

  // RAF registration
  useEffect(() => {
    const outputKey = `${id}:scalar-source-0`;

    registerCallback(id, (time: number) => {
      if (isPlayingRef.current) {
        // Compute delta from last frame
        const last = lastRafTimeRef.current;
        if (last !== null) {
          const deltaSec = (time - last) / 1000;
          internalTimeRef.current += deltaSec * speedRef.current;
        }
        lastRafTimeRef.current = time;

        const transformed = computeTransformedTime(internalTimeRef.current);
        frozenValueRef.current = transformed;
        setScalarOutput(outputKey, transformed);

        // Update DOM directly
        const start = rangeStartRef.current;
        const end = rangeEndRef.current;
        const duration = Math.max(end - start, 0.001);
        const progress = Math.max(0, Math.min(1, (transformed - start) / duration));

        if (playheadRef.current) {
          playheadRef.current.style.left = `${progress * 100}%`;
        }
        if (timeDisplayRef.current) {
          timeDisplayRef.current.textContent = `${transformed.toFixed(2)}s`;
        }
        if (outputDisplayRef.current) {
          outputDisplayRef.current.textContent = transformed.toFixed(2);
        }
      } else {
        // Paused: keep publishing frozen value, reset lastRafTime
        lastRafTimeRef.current = null;
        setScalarOutput(outputKey, frozenValueRef.current);
      }
    });

    return () => {
      unregisterCallback(id);
      removeScalarOutput(outputKey);
    };
  }, [id, computeTransformedTime]);

  // UI callbacks
  const handleChange = useCallback(
    (field: string, value: string | number | boolean) => {
      updateNodeData(id, { [field]: value });
    },
    [id, updateNodeData],
  );

  const handlePlayPause = useCallback(() => {
    const newPlaying = !isPlayingRef.current;
    if (newPlaying) {
      // Resuming: reset lastRafTime so delta starts fresh
      lastRafTimeRef.current = null;
    }
    updateNodeData(id, { isPlaying: newPlaying });
  }, [id, updateNodeData]);

  const handleReset = useCallback(() => {
    internalTimeRef.current = 0;
    lastRafTimeRef.current = null;
    frozenValueRef.current = rangeStartRef.current;
    // Update DOM immediately
    if (playheadRef.current) playheadRef.current.style.left = '0%';
    if (timeDisplayRef.current) timeDisplayRef.current.textContent = `${rangeStartRef.current.toFixed(2)}s`;
    if (outputDisplayRef.current) outputDisplayRef.current.textContent = rangeStartRef.current.toFixed(2);
  }, []);

  const handleSpeedPreset = useCallback(
    (v: number) => {
      updateNodeData(id, { speed: v });
    },
    [id, updateNodeData],
  );

  const isPresetSpeed = SPEED_PRESETS.some((p) => p.value === speed);

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 230,
        maxWidth: 260,
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
        <Clock size={14} color={CONTROL_COLOR} />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500, flex: 1 }}>
          Time Control
        </span>
      </div>

      {/* Mini Timeline */}
      <div
        className="nodrag"
        style={{
          width: TIMELINE_WIDTH,
          height: TIMELINE_HEIGHT,
          background: '#111',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 8,
          border: '1px solid #333',
        }}
      >
        {/* Track */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 4,
            right: 4,
            height: 2,
            background: '#333',
            borderRadius: 1,
            transform: 'translateY(-50%)',
          }}
        />
        {/* Playhead */}
        <div
          ref={playheadRef}
          style={{
            position: 'absolute',
            top: 2,
            bottom: 2,
            width: 2,
            background: CONTROL_COLOR,
            borderRadius: 1,
            left: '0%',
            transition: 'none',
            boxShadow: `0 0 4px ${CONTROL_COLOR}80`,
          }}
        />
      </div>

      {/* Playback Controls */}
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          className="nodrag flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-white/10"
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button
          type="button"
          className="nodrag flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-white/10"
          onClick={handleReset}
          title="Reset"
        >
          <RotateCcw size={12} />
        </button>
        <span
          ref={timeDisplayRef}
          className="ml-auto text-[11px] tabular-nums text-gray-400"
        >
          {timeRangeStart.toFixed(2)}s
        </span>
      </div>

      {/* Speed Section */}
      <Section
        title="Speed"
        open={speedOpen}
        onToggle={() => setSpeedOpen((v) => !v)}
      >
        <div className="mb-1.5">
          <SegmentedControl
            options={SPEED_PRESETS.map((p) => ({ label: p.label, value: String(p.value) }))}
            value={isPresetSpeed ? String(speed) : ''}
            onChange={(v) => handleSpeedPreset(Number(v))}
          />
        </div>
        {!isPresetSpeed && (
          <ParamSlider
            label="Custom Speed"
            value={speed}
            min={0.1}
            max={5}
            step={0.1}
            onChange={(v) => handleChange('speed', v)}
            suffix="x"
          />
        )}
      </Section>

      {/* Loop Mode Section */}
      <Section
        title="Loop Mode"
        open={loopOpen}
        onToggle={() => setLoopOpen((v) => !v)}
      >
        <SegmentedControl<LoopMode>
          options={[
            { label: 'Loop', value: 'loop' },
            { label: 'Ping-Pong', value: 'ping-pong' },
            { label: 'Once', value: 'once' },
          ]}
          value={loopMode}
          onChange={(v) => handleChange('loopMode', v)}
        />
      </Section>

      {/* Time Range Section */}
      <Section
        title="Time Range"
        open={rangeOpen}
        onToggle={() => {
          setRangeOpen((v) => !v);
          handleChange('positionSectionOpen', !rangeOpen);
        }}
      >
        <ParamSlider
          label="Start"
          value={timeRangeStart}
          min={0}
          max={60}
          step={0.1}
          onChange={(v) => handleChange('timeRangeStart', v)}
          suffix="s"
        />
        <ParamSlider
          label="End"
          value={timeRangeEnd}
          min={0}
          max={60}
          step={0.1}
          onChange={(v) => handleChange('timeRangeEnd', v)}
          suffix="s"
        />
        <div className="text-[9px] text-gray-500">
          {timeRangeStart.toFixed(1)}s — {timeRangeEnd.toFixed(1)}s
        </div>
      </Section>

      {/* Scalar Output Port */}
      <div style={{ position: 'relative' }}>
        <TypedHandle
          type="source"
          position={Position.Right}
          portType="scalar"
          portId="scalar-source-0"
          index={0}
          style={{ top: '50%' }}
        />
        <span
          className="pointer-events-none absolute text-[9px] text-gray-400"
          style={{ right: 18, top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}
        >
          Time: <span ref={outputDisplayRef}>{timeRangeStart.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}

export const TimeControlNode = withNodeErrorBoundary(TimeControlNodeInner);
export default TimeControlNode;
