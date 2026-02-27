import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withValidation, apiError } from '@/lib/api/validation';
import { downloadFromCdn, isFalCdnUrl } from '@/lib/api/cdn-download';

const downloadSchema = z.object({ url: z.string().url() }).strict();

export const POST = withValidation(downloadSchema, async (request, body, context) => {
  const { projectId } = await context.params;

  if (!isFalCdnUrl(body.url)) {
    console.warn(
      `[SECURITY] SSRF blocked: ip=${request.headers.get('x-forwarded-for') ?? 'local'}, url=${body.url}, project=${projectId}, type=ssrf`,
    );
    return apiError(403, 'Forbidden', undefined, 'FORBIDDEN');
  }

  try {
    const result = await downloadFromCdn({
      url: body.url,
      storagePath: `storage/${projectId}/output`,
      defaultExt: '.png',
      servePrefix: `/api/storage/${projectId}/output`,
    });
    return NextResponse.json(result);
  } catch {
    return apiError(500, 'Failed to download file', undefined, 'INTERNAL_ERROR');
  }
});
