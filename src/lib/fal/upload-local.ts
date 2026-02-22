import { fal } from '@/lib/fal/client';

/**
 * Detect whether a URL points to a locally served image.
 * Local URLs: /api/images/*, http://localhost*, http://127.0.0.1*
 */
export function isLocalImageUrl(url: string): boolean {
  return (
    url.startsWith('/api/images/') ||
    url.startsWith('http://localhost') ||
    url.startsWith('http://127.0.0.1')
  );
}

/**
 * If the URL points to a local image, fetch its bytes and re-upload to fal CDN.
 * Returns the fal CDN URL (https://). For already-remote URLs, returns as-is.
 *
 * Per user decision: no caching (always re-upload), transparent to user,
 * retry 3 times with exponential backoff on failure.
 */
export async function ensureFalCdnUrl(
  url: string,
  retries = 3,
): Promise<string> {
  if (!isLocalImageUrl(url)) return url;

  // For relative URLs, make absolute using window.location.origin
  // (executors run in client context only -- 'use client' modules)
  const absoluteUrl = url.startsWith('/')
    ? `${window.location.origin}${url}`
    : url;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(absoluteUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch local image: ${response.status}`);
      }
      const blob = await response.blob();
      const cdnUrl = await fal.storage.upload(blob);
      return cdnUrl;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw new Error(
    `Failed to upload local image to fal CDN after ${retries} attempts: ${lastError?.message}`,
  );
}
