'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type NodeProps, Position } from '@xyflow/react';
import { ImagePlus, Upload, Loader2 } from 'lucide-react';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { useExecutionStore } from '@/stores/execution-store';
import type { ImageImportData } from '@/types/canvas';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function ImageImportNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ImageImportData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear error timer on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 3000);
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        showError('Only PNG, JPG, and WebP files are supported');
        return;
      }

      setIsUploading(true);
      setError(null);

      try {
        const projectId = useExecutionStore.getState().projectId;
        if (!projectId) {
          showError('No project context — save the project first');
          return;
        }

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`/api/storage/${projectId}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json();
          showError(body.error || 'Upload failed');
          return;
        }

        const { url } = await res.json();
        updateNodeData(id, { imageUrl: url, fileName: file.name });
      } catch {
        showError('Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [id, updateNodeData, showError]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      // Reset so selecting the same file triggers change again
      e.target.value = '';
    },
    [uploadFile]
  );

  const hasImage = !!nodeData.imageUrl;

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 200,
        position: 'relative',
        boxShadow: selected
          ? '0 0 0 2px #2a8af6, 0 0 12px rgba(42, 138, 246, 0.3)'
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
        <ImagePlus size={14} color="#2a8af6" />
        <span
          style={{
            color: '#f3f4f6',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Image Import
        </span>
      </div>

      {/* Drop zone / Preview */}
      <div
        className="nodrag nowheel"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        style={{
          width: '100%',
          minHeight: 120,
          border: `2px dashed ${isDragOver ? '#2a8af6' : '#333'}`,
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          transition: 'border-color 0.15s ease',
          background: isDragOver ? 'rgba(42, 138, 246, 0.05)' : 'transparent',
        }}
      >
        {isUploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              borderRadius: 4,
            }}
          >
            <Loader2 size={24} color="#2a8af6" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {hasImage ? (
          <>
            <img
              src={nodeData.imageUrl!}
              alt={nodeData.fileName ?? 'Uploaded image'}
              style={{
                maxWidth: '100%',
                maxHeight: 160,
                objectFit: 'contain',
                borderRadius: 4,
              }}
              draggable={false}
            />
            {nodeData.fileName && (
              <span
                style={{
                  color: '#9ca3af',
                  fontSize: 11,
                  marginTop: 4,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {nodeData.fileName}
              </span>
            )}
          </>
        ) : (
          <>
            <Upload size={24} color="#666" />
            <span
              style={{
                color: '#666',
                fontSize: 12,
                marginTop: 6,
                textAlign: 'center',
                padding: '0 8px',
              }}
            >
              Drop image here or click to browse
            </span>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            color: '#ef4444',
            fontSize: 11,
            marginTop: 4,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {/* Output port */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType="image"
        portId="image-source-0"
        index={0}
        style={{ top: '50%' }}
      />

      {/* Spinner keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
