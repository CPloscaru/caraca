import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Image URL detection — renders inline preview for image URLs in JSON values
// ---------------------------------------------------------------------------

const IMAGE_EXT_RE = /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)/i;
const FAL_MEDIA_RE = /^https?:\/\/(fal\.media|v\d+\.fal\.media)\//i;

function isImageUrl(value: string): boolean {
  return IMAGE_EXT_RE.test(value) || FAL_MEDIA_RE.test(value);
}

function ImagePreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      className="mt-1 max-h-20 rounded border border-white/10"
      onError={() => setFailed(true)}
    />
  );
}

type JsonTreeViewProps = {
  data: unknown;
  defaultExpanded?: number;
};

export function JsonTreeView({ data, defaultExpanded = 2 }: JsonTreeViewProps) {
  return (
    <div className="text-[11px] font-mono leading-relaxed">
      <JsonNode value={data} depth={0} defaultExpanded={defaultExpanded} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal recursive node renderer
// ---------------------------------------------------------------------------

type JsonNodeProps = {
  keyName?: string;
  value: unknown;
  depth: number;
  defaultExpanded: number;
  isLast?: boolean;
};

function JsonNode({ keyName, value, depth, defaultExpanded, isLast = true }: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < defaultExpanded);
  const toggle = useCallback(() => setExpanded((e) => !e), []);

  const indent = { paddingLeft: depth * 16 };

  // Primitives
  if (value === null || value === undefined) {
    return (
      <div style={indent}>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-gray-500">null</span>
        {!isLast && <span className="text-gray-400">,</span>}
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div style={indent}>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-blue-400">{String(value)}</span>
        {!isLast && <span className="text-gray-400">,</span>}
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div style={indent}>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-amber-400">{String(value)}</span>
        {!isLast && <span className="text-gray-400">,</span>}
      </div>
    );
  }

  if (typeof value === 'string') {
    const display = value.length > 200 ? value.slice(0, 200) + '...' : value;
    const showPreview = isImageUrl(value);
    return (
      <div style={indent}>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-green-400">&quot;{display}&quot;</span>
        {!isLast && <span className="text-gray-400">,</span>}
        {showPreview && <ImagePreview src={value} />}
      </div>
    );
  }

  // Arrays
  if (Array.isArray(value)) {
    const count = value.length;
    if (count === 0) {
      return (
        <div style={indent}>
          {keyName !== undefined && <KeyLabel name={keyName} />}
          <span className="text-gray-400">[]</span>
          {!isLast && <span className="text-gray-400">,</span>}
        </div>
      );
    }

    return (
      <>
        <div
          style={indent}
          className="cursor-pointer hover:bg-white/5 select-none"
          onClick={toggle}
        >
          {expanded ? (
            <ChevronDown className="inline h-3 w-3 text-gray-400 mr-0.5" />
          ) : (
            <ChevronRight className="inline h-3 w-3 text-gray-400 mr-0.5" />
          )}
          {keyName !== undefined && <KeyLabel name={keyName} />}
          {expanded ? (
            <span className="text-gray-400">[</span>
          ) : (
            <>
              <span className="text-gray-400">[...] ({count})</span>
              {!isLast && <span className="text-gray-400">,</span>}
            </>
          )}
        </div>
        {expanded && (
          <>
            {value.map((item, i) => (
              <JsonNode
                key={i}
                value={item}
                depth={depth + 1}
                defaultExpanded={defaultExpanded}
                isLast={i === count - 1}
              />
            ))}
            <div style={indent}>
              <span className="text-gray-400">]</span>
              {!isLast && <span className="text-gray-400">,</span>}
            </div>
          </>
        )}
      </>
    );
  }

  // Objects
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const count = entries.length;

    if (count === 0) {
      return (
        <div style={indent}>
          {keyName !== undefined && <KeyLabel name={keyName} />}
          <span className="text-gray-400">{'{}'}</span>
          {!isLast && <span className="text-gray-400">,</span>}
        </div>
      );
    }

    return (
      <>
        <div
          style={indent}
          className="cursor-pointer hover:bg-white/5 select-none"
          onClick={toggle}
        >
          {expanded ? (
            <ChevronDown className="inline h-3 w-3 text-gray-400 mr-0.5" />
          ) : (
            <ChevronRight className="inline h-3 w-3 text-gray-400 mr-0.5" />
          )}
          {keyName !== undefined && <KeyLabel name={keyName} />}
          {expanded ? (
            <span className="text-gray-400">{'{'}</span>
          ) : (
            <>
              <span className="text-gray-400">{'{...}'} ({count})</span>
              {!isLast && <span className="text-gray-400">,</span>}
            </>
          )}
        </div>
        {expanded && (
          <>
            {entries.map(([k, v], i) => (
              <JsonNode
                key={k}
                keyName={k}
                value={v}
                depth={depth + 1}
                defaultExpanded={defaultExpanded}
                isLast={i === count - 1}
              />
            ))}
            <div style={indent}>
              <span className="text-gray-400">{'}'}</span>
              {!isLast && <span className="text-gray-400">,</span>}
            </div>
          </>
        )}
      </>
    );
  }

  // Fallback
  return (
    <div style={indent}>
      {keyName !== undefined && <KeyLabel name={keyName} />}
      <span className="text-gray-400">{String(value)}</span>
      {!isLast && <span className="text-gray-400">,</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key label helper
// ---------------------------------------------------------------------------

function KeyLabel({ name }: { name: string }) {
  return (
    <>
      <span className="text-purple-300">&quot;{name}&quot;</span>
      <span className="text-gray-400">: </span>
    </>
  );
}
