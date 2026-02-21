'use client';

import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AlertTriangle, X } from 'lucide-react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { Sidebar } from '@/components/canvas/Sidebar';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useCanvasStore } from '@/stores/canvas-store';
import type { WorkflowJson } from '@/types/canvas';

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

// Inner component that has access to ReactFlow context
function CanvasPageInner({ projectId }: { projectId: string }) {
  const [projectTitle, setProjectTitle] = useState('');
  const { saveStatus, markRestored } = useAutoSave(projectId);

  // Fetch project data on mount and restore workflow
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;

        if (data.title) setProjectTitle(data.title);

        // Restore workflow from saved state
        const wf = data.workflow_json as WorkflowJson | null;
        if (wf && wf.nodes && wf.nodes.length > 0) {
          const store = useCanvasStore.getState();
          store.setNodes(wf.nodes);
          store.setEdges(wf.edges || []);
        }

        // Mark restore complete so auto-save starts tracking changes
        // Use a small delay to let the store settle after setNodes/setEdges
        setTimeout(() => {
          if (!cancelled) markRestored();
        }, 100);
      })
      .catch(() => {
        // Project may not exist yet — mark restored so saves can start
        markRestored();
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, markRestored]);

  // Clear canvas store on unmount to avoid stale state when opening another project
  useEffect(() => {
    return () => {
      const store = useCanvasStore.getState();
      store.setNodes([]);
      store.setEdges([]);
    };
  }, []);

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
    <div
      className="flex h-screen w-screen flex-col"
      style={{ background: '#111111' }}
    >
      <Toolbar
        projectTitle={projectTitle}
        onTitleChange={handleTitleChange}
        saveStatus={saveStatus}
      />
      <WarningBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <Canvas />
      </div>
      <SettingsModal />
    </div>
  );
}

export function CanvasPage({ projectId }: { projectId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasPageInner projectId={projectId} />
    </ReactFlowProvider>
  );
}
