import { NextRequest } from 'next/server';
import { serveStaticFile } from '@/lib/api/serve-static';

const IMAGE_CONFIG = {
  storagePath: process.env.IMAGE_STORAGE_PATH || './storage/images',
  mimeTypes: {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  } as Record<string, string>,
  entityName: 'Image',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return serveStaticFile(request, id, IMAGE_CONFIG);
}
