import { NextResponse } from 'next/server';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';
import { withValidation, apiError } from '@/lib/api/validation';

const STORAGE_PATH =
  process.env.VIDEO_STORAGE_PATH || './storage/videos';

const ALLOWED_CDN_HOSTS = [
  'fal.media',
  'v3.fal.media',
  'storage.googleapis.com',
];

function isFalCdnUrl(urlString: string): boolean {
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

const downloadSchema = z.object({ url: z.string().url() }).strict();

export const POST = withValidation(downloadSchema, async (request, body) => {
  // SSRF protection: only allow fal.ai CDN domains
  if (!isFalCdnUrl(body.url)) {
    console.warn(
      `[SECURITY] SSRF blocked: ip=${request.headers.get('x-forwarded-for') ?? 'local'}, url=${body.url}, type=ssrf`,
    );
    return apiError(403, 'Forbidden', undefined, 'FORBIDDEN');
  }

  // Generate filename: YYYY-MM-DD_shortId.mp4
  const date = new Date().toISOString().slice(0, 10);
  const shortId = crypto.randomBytes(3).toString('hex');
  const filename = `${date}_${shortId}.mp4`;

  // Ensure storage directory exists
  await mkdir(STORAGE_PATH, { recursive: true });

  // Fetch video from CDN
  const response = await fetch(body.url);
  if (!response.ok) {
    return apiError(500, 'Failed to download video', undefined, 'INTERNAL_ERROR');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(`${STORAGE_PATH}/${filename}`, buffer);

  return NextResponse.json({
    id: filename,
    localUrl: `/api/videos/${filename}`,
  });
});
