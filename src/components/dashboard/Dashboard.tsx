'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ProjectCard } from '@/components/dashboard/ProjectCard';

type Project = {
  id: string;
  title: string;
  thumbnail_path: string | null;
  updated_at: number;
};

export function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'projects' | 'templates'>('projects');
  const [searchQuery, setSearchQuery] = useState('');

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
                />
              ))}
            </div>
          )
        ) : (
          <div
            style={{
              color: '#6b7280',
              textAlign: 'center',
              paddingTop: 80,
              fontSize: 14,
            }}
          >
            Templates coming soon. Save any project as a template from its context
            menu.
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
    </div>
  );
}
