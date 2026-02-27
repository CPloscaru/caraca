/**
 * Shared CDN download logic for images and videos.
 * Used by /api/storage/{projectId}/download route.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';

export const ALLOWED_CDN_HOSTS = [
  'fal.media',
  'v3.fal.media',
  'storage.googleapis.com',
];

export function isFalCdnUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return ALLOWED_CDN_HOSTS.some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith('.' + host),
    );
  } catch {
    return false;
  }
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

function detectExtension(
  contentType: string | null,
  url: string,
  defaultExt: string,
): string {
  if (contentType) {
    const mapped = CONTENT_TYPE_EXT[contentType.split(';')[0].trim()];
    if (mapped) return mapped;
  }
  // Fallback: try to extract from URL path
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\.([a-z0-9]+)$/i);
  if (match) {
    const ext = '.' + match[1].toLowerCase();
    if (Object.values(CONTENT_TYPE_EXT).includes(ext)) return ext;
  }
  return defaultExt;
}

export async function downloadFromCdn(options: {
  url: string;
  storagePath: string;
  defaultExt: string;
  servePrefix: string;
}): Promise<{ id: string; localUrl: string }> {
  const { url, storagePath, defaultExt, servePrefix } = options;

  await mkdir(storagePath, { recursive: true });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CDN fetch failed with status ${response.status}`);
  }

  const ext = detectExtension(
    response.headers.get('content-type'),
    url,
    defaultExt,
  );
  const date = new Date().toISOString().slice(0, 10);
  const shortId = crypto.randomBytes(3).toString('hex');
  const filename = `${date}_${shortId}${ext}`;

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(`${storagePath}/${filename}`, buffer);

  return { id: filename, localUrl: `${servePrefix}/${filename}` };
}
