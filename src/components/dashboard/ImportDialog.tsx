'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, FileJson, Upload, Replace } from 'lucide-react';
import { importWorkflow } from '@/lib/export-import';
import type { Node, Edge } from '@xyflow/react';

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  file: File | null;
  currentProjectId?: string;
  /** Called after "Replace current canvas" succeeds so the parent can refresh state */
  onReplaced?: (data: { title: string; nodes: Node[]; edges: Edge[] }) => void;
};

export function ImportDialog({
  open,
  onClose,
  file,
  currentProjectId,
  onReplaced,
}: ImportDialogProps) {
  const router = useRouter();
  const [parsed, setParsed] = useState<{
    title: string;
    nodes: Node[];
    edges: Edge[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Parse the file when it changes
  useEffect(() => {
    if (!file) {
      setParsed(null);
      setError(null);
      return;
    }

    importWorkflow(file)
      .then((data) => {
        setParsed(data);
        setError(null);
      })
      .catch((err: Error) => {
        setParsed(null);
        setError(err.message);
      });
  }, [file]);

  const handleImportAsNew = useCallback(async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: parsed.title,
          workflow_json: {
            nodes: parsed.nodes,
            edges: parsed.edges,
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      });
      const project = await res.json();
      onClose();
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error('Import as new project failed:', err);
      setError('Failed to create project. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [parsed, onClose, router]);

  const handleReplaceCurrent = useCallback(async () => {
    if (!parsed || !currentProjectId) return;
    setImporting(true);
    try {
      await fetch(`/api/projects/${currentProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: parsed.title,
          workflow_json: {
            nodes: parsed.nodes,
            edges: parsed.edges,
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      });
      onReplaced?.(parsed);
      onClose();
    } catch (err) {
      console.error('Replace canvas failed:', err);
      setError('Failed to replace canvas. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [parsed, currentProjectId, onClose, onReplaced]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e1e1e',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 24,
          maxWidth: 440,
          width: '90%',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              color: '#f3f4f6',
              fontSize: 16,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <FileJson size={18} />
            Import Workflow
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              padding: 12,
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {/* Parsed info */}
        {parsed && (
          <>
            <div
              style={{
                background: '#111111',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  color: '#f3f4f6',
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 6,
                }}
              >
                {parsed.title}
              </div>
              <div style={{ color: '#9ca3af', fontSize: 12 }}>
                {parsed.nodes.length} node{parsed.nodes.length !== 1 ? 's' : ''},{' '}
                {parsed.edges.length} edge{parsed.edges.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleImportAsNew}
                disabled={importing}
                style={{
                  background: 'rgba(174, 83, 186, 0.15)',
                  border: '1px solid rgba(174, 83, 186, 0.3)',
                  borderRadius: 8,
                  color: '#e9b5f0',
                  cursor: importing ? 'not-allowed' : 'pointer',
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: importing ? 0.6 : 1,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!importing)
                    (e.currentTarget as HTMLElement).style.background =
                      'rgba(174, 83, 186, 0.25)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    'rgba(174, 83, 186, 0.15)';
                }}
              >
                <Upload size={16} />
                Import as new project
              </button>

              {currentProjectId && (
                <button
                  onClick={handleReplaceCurrent}
                  disabled={importing}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid #333',
                    borderRadius: 8,
                    color: '#d1d5db',
                    cursor: importing ? 'not-allowed' : 'pointer',
                    padding: '10px 16px',
                    fontSize: 13,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: importing ? 0.6 : 1,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!importing)
                      (e.currentTarget as HTMLElement).style.background =
                        'rgba(255,255,255,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      'rgba(255,255,255,0.04)';
                  }}
                >
                  <Replace size={16} />
                  Replace current canvas
                </button>
              )}
            </div>
          </>
        )}

        {/* Loading state */}
        {!parsed && !error && (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>
            Reading file...
          </div>
        )}
      </div>
    </div>
  );
}
