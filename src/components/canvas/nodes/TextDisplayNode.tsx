'use client';

import { useState, useMemo, useCallback } from 'react';
import { type NodeProps, Position, NodeResizer } from '@xyflow/react';
import { Copy, Check } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import type { TextDisplayData } from '@/types/canvas';

// Configure marked: sync rendering, GFM, links open in new tab
const renderer = new marked.Renderer();
renderer.link = ({ href, text }: { href: string; text: string }) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
marked.use({ async: false, gfm: true, renderer });

export function TextDisplayNode({ id: _id, data, selected }: NodeProps) {
  const nodeData = data as unknown as TextDisplayData;
  const displayText = nodeData.displayText ?? '';

  const [copied, setCopied] = useState(false);

  const renderedHtml = useMemo(() => {
    if (!displayText) return '';
    return DOMPurify.sanitize(marked.parse(displayText) as string);
  }, [displayText]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [displayText]);

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 8,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected
          ? '0 0 0 2px #6b7280, 0 0 12px rgba(107, 114, 128, 0.3)'
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={80}
        isVisible={!!selected}
        lineStyle={{ borderColor: '#6b7280' }}
        handleStyle={{ backgroundColor: '#6b7280', width: 8, height: 8 }}
      />

      <TypedHandle
        type="target"
        position={Position.Left}
        portType="text"
        portId="text-target-0"
        index={0}
      />

      {displayText ? (
        <>
          {/* Copy button */}
          <button
            className="nodrag"
            onClick={handleCopy}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: copied ? '#22c55e' : '#9ca3af',
              cursor: 'pointer',
              zIndex: 1,
              transition: 'color 0.15s ease, background 0.15s ease',
            }}
            title="Copy text"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>

          {/* Markdown content */}
          <div
            className="nodrag nowheel text-display-rendered"
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 10,
              minHeight: 0,
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />

          <style>{`
            .text-display-rendered {
              color: #d1d5db;
              font-size: 12px;
              line-height: 1.6;
              font-family: inherit;
            }
            .text-display-rendered p {
              margin: 0 0 4px 0;
            }
            .text-display-rendered h1 {
              font-size: 16px;
              font-weight: 600;
              margin: 6px 0 4px 0;
              color: #f3f4f6;
            }
            .text-display-rendered h2 {
              font-size: 14px;
              font-weight: 600;
              margin: 5px 0 3px 0;
              color: #f3f4f6;
            }
            .text-display-rendered h3 {
              font-size: 13px;
              font-weight: 600;
              margin: 4px 0 3px 0;
              color: #f3f4f6;
            }
            .text-display-rendered strong {
              font-weight: 600;
              color: #f3f4f6;
            }
            .text-display-rendered em {
              font-style: italic;
            }
            .text-display-rendered ul,
            .text-display-rendered ol {
              margin: 4px 0;
              padding-left: 18px;
            }
            .text-display-rendered li {
              margin: 2px 0;
            }
            .text-display-rendered blockquote {
              border-left: 3px solid #6b7280;
              padding-left: 10px;
              margin: 4px 0;
              color: #9ca3af;
            }
            .text-display-rendered code {
              background: #2a2a2a;
              padding: 1px 4px;
              border-radius: 3px;
              font-size: 11px;
              font-family: monospace;
            }
            .text-display-rendered pre {
              background: #111;
              padding: 8px;
              border-radius: 4px;
              overflow-x: auto;
              margin: 4px 0;
            }
            .text-display-rendered pre code {
              background: transparent;
              padding: 0;
            }
            .text-display-rendered a {
              color: #60a5fa;
              text-decoration: underline;
              text-underline-offset: 2px;
            }
            .text-display-rendered a:hover {
              color: #93bbfd;
            }
          `}</style>
        </>
      ) : null}
    </div>
  );
}
