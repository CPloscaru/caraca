'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimationPreview } from '@/components/dashboard/AnimationPreview';
import { WorkflowDiagram } from '@/components/dashboard/WorkflowDiagram';
import type { TemplateCategory } from '@/lib/templates';
import type { Node, Edge } from '@xyflow/react';

type TemplateCardProps = {
  id: string;
  title: string;
  description: string;
  thumbnailGradient: string;
  nodes: Node[];
  edges: Edge[];
  isCustom?: boolean;
  isNew?: boolean;
  category?: TemplateCategory;
  tags?: string[];
};

export function TemplateCard({
  id,
  title,
  description,
  thumbnailGradient,
  nodes,
  edges,
  isCustom,
  isNew,
  category,
  tags,
}: TemplateCardProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const handleClick = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          workflow_json: {
            nodes,
            edges,
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      });
      const project = await res.json();
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error('Failed to create project from template:', err);
      setCreating(false);
    }
  }, [creating, title, nodes, edges, router]);

  const isAnimation = category === 'animation';

  return (
    <div
      onClick={handleClick}
      style={{
        background: '#1a1a1a',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: creating ? 'wait' : 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        position: 'relative',
        opacity: creating ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!creating) {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLElement).style.boxShadow =
            '0 4px 20px rgba(0,0,0,0.3)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      {/* Thumbnail: live WebGL preview for animation, static gradient otherwise */}
      {isAnimation ? (
        <div
          style={{
            height: 160,
            borderBottom: '1px solid #2a2a2a',
            position: 'relative',
          }}
        >
          <AnimationPreview templateId={id} height={160} />
          <span
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              color: 'rgba(255,255,255,0.7)',
              fontSize: 12,
              fontWeight: 500,
              background: 'rgba(0,0,0,0.25)',
              padding: '4px 10px',
              borderRadius: 4,
            }}
          >
            {nodes.length} node{nodes.length !== 1 ? 's' : ''}
          </span>
        </div>
      ) : (
        <WorkflowDiagram
          nodes={nodes}
          edges={edges}
          gradient={thumbnailGradient}
          height={160}
        />
      )}

      {/* Custom badge */}
      {isCustom && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(174, 83, 186, 0.8)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Custom
        </div>
      )}

      {/* New badge */}
      {isNew && !isCustom && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(34, 197, 94, 0.85)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          New
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
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
          {title}
        </div>
        <div
          style={{
            color: '#9ca3af',
            fontSize: 12,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {description}
        </div>

        {/* Tag pills */}
        {tags && tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#9ca3af',
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
