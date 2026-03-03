'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { TemplateCard } from '@/components/dashboard/TemplateCard';
import { ImportDialog } from '@/components/dashboard/ImportDialog';
import { getTemplatesByCategory } from '@/lib/templates';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Media inlining — converts image/video URLs to base64 data URIs
// ---------------------------------------------------------------------------

/** Fetch a URL and return a base64 data URI, or null on failure. */
async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Walk all workflow nodes and replace media URLs with base64 data URIs. */
async function inlineMediaAsBase64(
  nodes: Array<{ data: Record<string, unknown> }>,
): Promise<void> {
  const jobs: Array<Promise<void>> = [];

  for (const node of nodes) {
    const d = node.data;

    // ImageImport: imageUrl
    if (typeof d.imageUrl === 'string' && !d.imageUrl.startsWith('data:')) {
      jobs.push(
        urlToDataUri(d.imageUrl).then((uri) => {
          if (uri) d.imageUrl = uri;
        }),
      );
    }

    // ImageGenerator: images array
    if (Array.isArray(d.images)) {
      for (const img of d.images as Array<{ url: string }>) {
        if (typeof img.url === 'string' && !img.url.startsWith('data:')) {
          jobs.push(
            urlToDataUri(img.url).then((uri) => {
              if (uri) img.url = uri;
            }),
          );
        }
      }
    }

    // ImageUpscale: outputImage
    const upOut = d.outputImage as { url: string } | null | undefined;
    if (upOut && typeof upOut.url === 'string' && !upOut.url.startsWith('data:')) {
      jobs.push(
        urlToDataUri(upOut.url).then((uri) => {
          if (uri) upOut.url = uri;
        }),
      );
    }

    // Video nodes: videoUrl, cdnUrl, videoResults
    for (const key of ['videoUrl', 'cdnUrl'] as const) {
      if (typeof d[key] === 'string' && !(d[key] as string).startsWith('data:')) {
        const url = d[key] as string;
        jobs.push(
          urlToDataUri(url).then((uri) => {
            if (uri) d[key] = uri;
          }),
        );
      }
    }
    if (Array.isArray(d.videoResults)) {
      for (const vr of d.videoResults as Array<{ videoUrl: string; cdnUrl: string }>) {
        for (const vk of ['videoUrl', 'cdnUrl'] as const) {
          if (typeof vr[vk] === 'string' && !vr[vk].startsWith('data:')) {
            const url = vr[vk];
            jobs.push(
              urlToDataUri(url).then((uri) => {
                if (uri) vr[vk] = uri;
              }),
            );
          }
        }
      }
    }
  }

  await Promise.all(jobs);
}

// ---------------------------------------------------------------------------

type Project = {
  id: string;
  title: string;
  thumbnail_path: string | null;
  updated_at: number;
};

type UserTemplate = {
  id: string;
  title: string;
  template_description: string | null;
  workflow_json: {
    nodes: Node[];
    edges: Edge[];
  } | null;
};

export function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'projects' | 'templates'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch user-created templates when templates tab is active
  useEffect(() => {
    if (activeTab !== 'templates') return;
    fetch('/api/projects?templates=true')
      .then((res) => res.json())
      .then((data) => setUserTemplates(data))
      .catch((err) => console.error('Failed to fetch user templates:', err));
  }, [activeTab]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        setProjects((prev) => prev.filter((p) => p.id !== id));
      } catch (err) {
        console.error('Failed to delete project:', err);
      }
    },
    [],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        // Get the source project's data
        const srcRes = await fetch(`/api/projects/${id}`);
        if (!srcRes.ok) return;
        const srcProject = await srcRes.json();

        // Create new project
        const createRes = await fetch('/api/projects', { method: 'POST' });
        const newProject = await createRes.json();

        // Copy workflow data to the new project
        await fetch(`/api/projects/${newProject.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${srcProject.title} (copy)`,
            workflow_json: srcProject.workflow_json,
          }),
        });

        router.push(`/project/${newProject.id}`);
      } catch (err) {
        console.error('Failed to duplicate project:', err);
      }
    },
    [router],
  );

  const handleRename = useCallback(
    async (id: string, newTitle: string) => {
      try {
        await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, title: newTitle } : p)),
        );
      } catch (err) {
        console.error('Failed to rename project:', err);
      }
    },
    [],
  );

  const handleImportFile = useCallback((file: File) => {
    setImportFile(file);
    setImportDialogOpen(true);
  }, []);

  const handleCloseImport = useCallback(() => {
    setImportDialogOpen(false);
    setImportFile(null);
  }, []);

  const handleSaveAsTemplate = useCallback(async (id: string) => {
    try {
      const srcRes = await fetch(`/api/projects/${id}`);
      if (!srcRes.ok) return;
      const srcProject = await srcRes.json();

      // Inline media assets as base64 data URIs so templates are self-contained
      const workflow = srcProject.workflow_json as {
        nodes: Array<{ data: Record<string, unknown> }>;
      } | null;
      if (workflow?.nodes) {
        await inlineMediaAsBase64(workflow.nodes);
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: srcProject.title,
          workflow_json: workflow,
          is_template: true,
          template_source: 'user',
          template_description: `Custom template from ${srcProject.title}`,
        }),
      });
      if (res.ok) {
        console.log('Saved as template successfully');
      }
    } catch (err) {
      console.error('Failed to save as template:', err);
    }
  }, []);

  const filteredProjects = searchQuery
    ? projects.filter((p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : projects;

  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={{ background: '#111111' }}
    >
      <DashboardHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onImportFile={handleImportFile}
      />

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
        }}
      >
        {activeTab === 'projects' ? (
          loading ? (
            <div
              style={{
                color: '#6b7280',
                textAlign: 'center',
                paddingTop: 80,
                fontSize: 14,
              }}
            >
              Loading projects...
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 20,
              }}
            >
              <ProjectCard isNew />
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onRename={handleRename}
                  onSaveAsTemplate={handleSaveAsTemplate}
                />
              ))}
            </div>
          )
        ) : (
          <div>
            {/* Animation section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <h3 style={{ color: '#f3f4f6', fontSize: 16, fontWeight: 600, margin: 0 }}>
                Animation
              </h3>
              <span
                style={{
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
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 20,
                marginBottom: 32,
              }}
            >
              {getTemplatesByCategory('animation').map((template) => (
                <TemplateCard
                  key={template.id}
                  id={template.id}
                  title={template.title}
                  description={template.description}
                  thumbnailGradient={template.thumbnailGradient}
                  nodes={template.nodes}
                  edges={template.edges}
                  isNew={template.isNew}
                />
              ))}
            </div>

            {/* AI Workflows section */}
            <h3 style={{ color: '#f3f4f6', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              AI Workflows
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 20,
                marginBottom: 32,
              }}
            >
              {getTemplatesByCategory('ai').map((template) => (
                <TemplateCard
                  key={template.id}
                  id={template.id}
                  title={template.title}
                  description={template.description}
                  thumbnailGradient={template.thumbnailGradient}
                  nodes={template.nodes}
                  edges={template.edges}
                  isNew={template.isNew}
                />
              ))}
            </div>

            {/* User templates section */}
            {userTemplates.length > 0 && (
              <>
                <h3 style={{ color: '#f3f4f6', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                  My Templates
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 20,
                  }}
                >
                  {userTemplates.map((ut) => (
                    <TemplateCard
                      key={ut.id}
                      id={ut.id}
                      title={ut.title}
                      description={ut.template_description || 'Custom template'}
                      thumbnailGradient="linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)"
                      nodes={ut.workflow_json?.nodes ?? []}
                      edges={ut.workflow_json?.edges ?? []}
                      isCustom
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Empty state for projects tab */}
        {activeTab === 'projects' && !loading && projects.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              paddingTop: 40,
              color: '#6b7280',
              fontSize: 14,
            }}
          >
            No projects yet. Click the + card above to create your first project.
          </div>
        )}
      </div>

      <ImportDialog
        open={importDialogOpen}
        onClose={handleCloseImport}
        file={importFile}
      />
    </div>
  );
}
