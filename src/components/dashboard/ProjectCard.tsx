'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Copy,
  Download,
  BookmarkPlus,
  Pencil,
} from 'lucide-react';

type Project = {
  id: string;
  title: string;
  thumbnail_path: string | null;
  updated_at: number;
};

type ProjectCardProps = {
  project?: Project;
  isNew?: boolean;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function ProjectCard({
  project,
  isNew,
  onDelete,
  onDuplicate,
  onRename,
}: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleNewProject = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { method: 'POST' });
      const data = await res.json();
      router.push(`/project/${data.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  }, [router]);

  const commitRename = useCallback(() => {
    setIsRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && project && trimmed !== project.title && onRename) {
      onRename(project.id, trimmed);
    }
  }, [renameValue, project, onRename]);

  // New project card
  if (isNew) {
    return (
      <div
        onClick={handleNewProject}
        style={{
          background: 'transparent',
          border: '2px dashed #333',
          borderRadius: 12,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minHeight: 260,
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(174, 83, 186, 0.5)';
          (e.currentTarget as HTMLElement).style.background = 'rgba(174, 83, 186, 0.04)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = '#333';
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        <Plus size={32} style={{ color: '#9ca3af' }} />
        <span style={{ color: '#9ca3af', fontSize: 14, fontWeight: 500 }}>
          New Project
        </span>
      </div>
    );
  }

  if (!project) return null;

  return (
    <>
      <div
        style={{
          background: '#1a1a1a',
          borderRadius: 12,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          position: 'relative',
        }}
        onClick={() => router.push(`/project/${project.id}`)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setRenameValue(project.title);
          setIsRenaming(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            height: 200,
            background: project.thumbnail_path
              ? `url(/${project.thumbnail_path}) center/cover`
              : 'linear-gradient(135deg, #1e1e2e 0%, #2a1a3a 50%, #1a2a3a 100%)',
            borderBottom: '1px solid #2a2a2a',
          }}
        />

        {/* Info */}
        <div style={{ padding: '12px 14px' }}>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              style={{
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#f3f4f6',
                fontSize: 14,
                fontWeight: 500,
                padding: '2px 6px',
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <div
              style={{
                color: '#f3f4f6',
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {project.title}
            </div>
          )}
          <div style={{ color: '#6b7280', fontSize: 12 }}>
            {formatRelativeTime(project.updated_at)}
          </div>
        </div>

        {/* Context menu trigger */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            borderRadius: 6,
            color: '#9ca3af',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            opacity: 0,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#9ca3af';
          }}
          // Make visible on card hover via parent
          className="card-menu-btn"
        >
          <MoreHorizontal size={18} />
        </button>

        {/* Context menu dropdown */}
        {menuOpen && (
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 36,
              right: 8,
              background: '#1e1e1e',
              border: '1px solid #333',
              borderRadius: 8,
              padding: 4,
              minWidth: 160,
              zIndex: 50,
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            }}
          >
            <MenuItem
              icon={<Pencil size={14} />}
              label="Rename"
              onClick={() => {
                setMenuOpen(false);
                setRenameValue(project.title);
                setIsRenaming(true);
              }}
            />
            <MenuItem
              icon={<Copy size={14} />}
              label="Duplicate"
              onClick={() => {
                setMenuOpen(false);
                onDuplicate?.(project.id);
              }}
            />
            <MenuItem
              icon={<Download size={14} />}
              label="Export"
              disabled
              onClick={() => {
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<BookmarkPlus size={14} />}
              label="Save as Template"
              disabled
              onClick={() => {
                setMenuOpen(false);
              }}
            />
            <div
              style={{
                height: 1,
                background: '#333',
                margin: '4px 0',
              }}
            />
            <MenuItem
              icon={<Trash2 size={14} />}
              label="Delete"
              danger
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
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
          onClick={() => setConfirmDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e1e1e',
              border: '1px solid #333',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '90%',
            }}
          >
            <h3
              style={{
                color: '#f3f4f6',
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Delete project?
            </h3>
            <p
              style={{
                color: '#9ca3af',
                fontSize: 14,
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              &quot;{project.title}&quot; will be removed from the dashboard.
              This can be undone from the database.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  background: '#2a2a2a',
                  border: '1px solid #333',
                  borderRadius: 6,
                  color: '#9ca3af',
                  padding: '8px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete?.(project.id);
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 6,
                  color: '#ef4444',
                  padding: '8px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for hovering card to show menu button */}
      <style>{`
        div:hover > .card-menu-btn {
          opacity: 1 !important;
        }
      `}</style>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        color: disabled ? '#4a4a4a' : danger ? '#ef4444' : '#d1d5db',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.1s ease',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.background = danger
            ? 'rgba(239, 68, 68, 0.1)'
            : 'rgba(255,255,255,0.05)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {icon}
      {label}
    </button>
  );
}
