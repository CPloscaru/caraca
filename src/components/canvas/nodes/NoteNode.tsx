'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { type NodeProps, NodeResizer, Handle, Position } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCanvasStore } from '@/stores/canvas-store';
import type { NoteNodeData } from '@/types/canvas';

// Custom Tiptap extension: plain Enter exits edit mode, Shift+Enter inserts newline
// Uses a mutable ref so the extension closure always calls the latest callback.
function createEnterExitExtension(exitRef: React.RefObject<(() => void) | null>) {
  return Extension.create({
    name: 'enterExit',
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          exitRef.current?.();
          return true;
        },
      };
    },
  });
}

export function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as NoteNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(nodeData.noteTitle ?? '');
  const localBodyRef = useRef(nodeData.noteBody ?? '');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Stable ref for exit callback used by the Tiptap extension
  const exitEditRef = useRef<(() => void) | null>(null);

  const save = useCallback(() => {
    updateNodeData(id, {
      noteTitle: localTitle,
      noteBody: localBodyRef.current,
    });
  }, [id, localTitle, updateNodeData]);

  const exitEdit = useCallback(() => {
    setEditing(false);
    save();
  }, [save]);

  // Keep exit ref current
  useEffect(() => {
    exitEditRef.current = exitEdit;
  }, [exitEdit]);

  // eslint-disable-next-line react-hooks/refs -- ref is read inside keyboard shortcut handler, not during render
  const extensions = useMemo(() => [StarterKit, createEnterExitExtension(exitEditRef)], []);

  const editor = useEditor({
    extensions,
    content: nodeData.noteBody || '',
    editable: false,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      localBodyRef.current = ed.getHTML();
    },
  });

  // Sync editing state to editor
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editing);
  }, [editor, editing]);

  // Sync external data changes
  useEffect(() => {
    setLocalTitle(nodeData.noteTitle ?? '');
  }, [nodeData.noteTitle]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = nodeData.noteBody ?? '';
    if (current !== incoming) {
      editor.commands.setContent(incoming);
      localBodyRef.current = incoming;
    }
  }, [editor, nodeData.noteBody]);

  const enterEdit = useCallback(() => {
    setEditing(true);
    // Focus editor after state update
    setTimeout(() => {
      editor?.commands.focus();
    }, 0);
  }, [editor]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // Check if focus is moving to another element inside the note node
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (relatedTarget && e.currentTarget.contains(relatedTarget)) return;
      if (editing) {
        exitEdit();
      }
    },
    [editing, exitEdit],
  );

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
        onDoubleClick={enterEdit}
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          cursor: editing ? 'text' : 'default',
        }}
      >
        <EditorContent
          editor={editor}
          className="note-body"
        />
      </div>

      {/* Tiptap styles */}
      <style>{`
        .note-body .ProseMirror {
          background: transparent;
          color: #d1d5db;
          font-size: 13px;
          line-height: 1.5;
          outline: none;
          min-height: 40px;
          font-family: inherit;
        }
        .note-body .ProseMirror[contenteditable="false"] {
          cursor: default;
        }
        .note-body .ProseMirror p {
          margin: 0 0 4px 0;
        }
        .note-body .ProseMirror h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 8px 0 4px 0;
          color: #f3f4f6;
        }
        .note-body .ProseMirror h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 6px 0 4px 0;
          color: #f3f4f6;
        }
        .note-body .ProseMirror h3 {
          font-size: 14px;
          font-weight: 600;
          margin: 4px 0 4px 0;
          color: #f3f4f6;
        }
        .note-body .ProseMirror strong {
          font-weight: 600;
          color: #f3f4f6;
        }
        .note-body .ProseMirror em {
          font-style: italic;
        }
        .note-body .ProseMirror ul,
        .note-body .ProseMirror ol {
          margin: 4px 0;
          padding-left: 20px;
        }
        .note-body .ProseMirror li {
          margin: 2px 0;
        }
        .note-body .ProseMirror blockquote {
          border-left: 3px solid #ae53ba;
          padding-left: 10px;
          margin: 4px 0;
          color: #9ca3af;
        }
        .note-body .ProseMirror code {
          background: #2a2a2a;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 12px;
          font-family: monospace;
        }
        .note-body .ProseMirror pre {
          background: #111;
          padding: 8px;
          border-radius: 4px;
          overflow-x: auto;
          margin: 4px 0;
        }
        .note-body .ProseMirror pre code {
          background: transparent;
          padding: 0;
        }
      `}</style>

      {/* Annotation source handle — small, subtle, at bottom-right */}
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
