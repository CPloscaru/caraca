'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { type NodeProps, NodeResizer, Handle, Position } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useCanvasStore } from '@/stores/canvas-store';
import type { NoteNodeData } from '@/types/canvas';

// Configure marked: sync rendering, GFM, links open in new tab
const renderer = new marked.Renderer();
renderer.link = ({ href, text }: { href: string; text: string }) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
marked.use({ async: false, gfm: true, renderer });

export function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as NoteNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(nodeData.noteTitle ?? '');
  const [localBody, setLocalBody] = useState(nodeData.noteBody ?? '');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const save = useCallback(() => {
    updateNodeData(id, {
      noteTitle: localTitle,
      noteBody: localBody,
    });
  }, [id, localTitle, localBody, updateNodeData]);

  const exitEdit = useCallback(() => {
    setEditing(false);
    save();
  }, [save]);

  // Sync external data changes
  useEffect(() => {
    setLocalTitle(nodeData.noteTitle ?? '');
  }, [nodeData.noteTitle]);

  useEffect(() => {
    setLocalBody(nodeData.noteBody ?? '');
  }, [nodeData.noteBody]);

  const enterEdit = useCallback(() => {
    setEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (relatedTarget && e.currentTarget.contains(relatedTarget)) return;
      if (editing) {
        exitEdit();
      }
    },
    [editing, exitEdit],
  );

  const handleBodyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        exitEdit();
      }
    },
    [exitEdit],
  );

  // Render markdown to HTML (memoized)
  const renderedHtml = useMemo(() => {
    if (!localBody) return '';
    const rawHtml = marked.parse(localBody) as string;
    return DOMPurify.sanitize(rawHtml);
  }, [localBody]);

  return (
    <div
      onBlur={handleBlur}
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected
          ? '0 0 0 2px #ae53ba, 0 0 12px rgba(174, 83, 186, 0.3)'
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        overflow: 'hidden',
      }}
    >
      <NodeResizer
        minWidth={180}
        minHeight={120}
        isVisible={!!selected}
        lineStyle={{ borderColor: '#ae53ba' }}
        handleStyle={{ backgroundColor: '#ae53ba', width: 8, height: 8 }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <StickyNote size={14} color="#ae53ba" />
        {editing ? (
          <input
            ref={titleInputRef}
            className="nodrag"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                exitEdit();
              }
            }}
            placeholder="Untitled Note"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #555',
              color: '#f3f4f6',
              fontSize: 13,
              fontWeight: 500,
              outline: 'none',
              padding: '0 0 2px 0',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <span
            style={{
              color: '#f3f4f6',
              fontSize: 13,
              fontWeight: 500,
              opacity: localTitle ? 1 : 0.5,
            }}
          >
            {localTitle || 'Untitled Note'}
          </span>
        )}
      </div>

      {/* Body */}
      <div
        className="nodrag nowheel"
        onDoubleClick={!editing ? enterEdit : undefined}
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          cursor: editing ? 'text' : 'default',
        }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="nodrag nowheel"
            value={localBody}
            onChange={(e) => setLocalBody(e.target.value)}
            onKeyDown={handleBodyKeyDown}
            placeholder="Write markdown... (Shift+Enter for newline)"
            style={{
              width: '100%',
              height: '100%',
              background: 'transparent',
              color: '#d1d5db',
              fontSize: 13,
              lineHeight: 1.5,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'monospace',
              padding: 0,
            }}
          />
        ) : (
          <div
            className="note-body-rendered"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
      </div>

      {/* Markdown rendered styles */}
      <style>{`
        .note-body-rendered {
          color: #d1d5db;
          font-size: 13px;
          line-height: 1.5;
          min-height: 40px;
          font-family: inherit;
        }
        .note-body-rendered p {
          margin: 0 0 4px 0;
        }
        .note-body-rendered h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 8px 0 4px 0;
          color: #f3f4f6;
        }
        .note-body-rendered h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 6px 0 4px 0;
          color: #f3f4f6;
        }
        .note-body-rendered h3 {
          font-size: 14px;
          font-weight: 600;
          margin: 4px 0 4px 0;
          color: #f3f4f6;
        }
        .note-body-rendered strong {
          font-weight: 600;
          color: #f3f4f6;
        }
        .note-body-rendered em {
          font-style: italic;
        }
        .note-body-rendered ul,
        .note-body-rendered ol {
          margin: 4px 0;
          padding-left: 20px;
        }
        .note-body-rendered li {
          margin: 2px 0;
        }
        .note-body-rendered blockquote {
          border-left: 3px solid #ae53ba;
          padding-left: 10px;
          margin: 4px 0;
          color: #9ca3af;
        }
        .note-body-rendered code {
          background: #2a2a2a;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 12px;
          font-family: monospace;
        }
        .note-body-rendered pre {
          background: #111;
          padding: 8px;
          border-radius: 4px;
          overflow-x: auto;
          margin: 4px 0;
        }
        .note-body-rendered pre code {
          background: transparent;
          padding: 0;
        }
        .note-body-rendered a {
          color: #ae53ba;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .note-body-rendered a:hover {
          color: #c77dd4;
        }
      `}</style>

      {/* Annotation source handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="annotation-out"
        className="nodrag"
        style={{
          width: 6,
          height: 6,
          background: '#ae53ba',
          border: 'none',
          opacity: selected ? 0.6 : 0.2,
          transition: 'opacity 0.2s ease',
          bottom: 12,
          top: 'auto',
        }}
      />
    </div>
  );
}
