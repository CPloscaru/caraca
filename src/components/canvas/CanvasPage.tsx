'use client';

import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AlertTriangle, X } from 'lucide-react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { Sidebar } from '@/components/canvas/Sidebar';
import { SettingsModal } from '@/components/settings/SettingsModal';

function WarningBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/settings/fal-key')
      .then((res) => res.json())
      .then((data: { status: string }) => {
        if (data.status === 'missing') {
          setVisible(true);
        }
      })
      .catch(() => {
        setVisible(true);
      });
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div
      style={{
        background: 'rgba(245, 158, 11, 0.08)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 12px',
        fontSize: 13,
        color: '#d4a44a',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <AlertTriangle size={16} />
      <span>
        fal.ai API key not configured. Add{' '}
        <code
          style={{
            background: '#2a2a2a',
            padding: '1px 4px',
            borderRadius: 3,
            fontSize: 12,
          }}
        >
          FAL_KEY=your-key
        </code>{' '}
        to{' '}
        <code
          style={{
            background: '#2a2a2a',
            padding: '1px 4px',
            borderRadius: 3,
            fontSize: 12,
          }}
        >
          .env.local
        </code>
      </span>
      <a
        href="https://fal.ai/dashboard/keys"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#2a8af6',
          textDecoration: 'underline',
          fontSize: 12,
          marginLeft: 4,
        }}
      >
        Get key
      </a>
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute',
          right: 8,
          background: 'transparent',
          border: 'none',
          color: '#9ca3af',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function CanvasPage({ projectId }: { projectId: string }) {
  const [projectTitle, setProjectTitle] = useState('');

  // Fetch project title on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) return;
        return res.json();
      })
      .then((data) => {
        if (data?.title) setProjectTitle(data.title);
      })
      .catch(() => {
        // Project may not exist yet
      });
  }, [projectId]);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setProjectTitle(newTitle);
      fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      }).catch(console.error);
    },
    [projectId],
  );

  return (
    <ReactFlowProvider>
      <div
        className="flex h-screen w-screen flex-col"
        style={{ background: '#111111' }}
      >
        <Toolbar
          projectTitle={projectTitle}
          onTitleChange={handleTitleChange}
        />
        <WarningBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <Canvas />
        </div>
        <SettingsModal />
      </div>
    </ReactFlowProvider>
  );
}
