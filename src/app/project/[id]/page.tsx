import { CanvasPage } from '@/components/canvas/CanvasPage';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CanvasPage projectId={id} />;
}
