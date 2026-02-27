import { NextRequest, NextResponse } from "next/server";

/**
 * Custom fal.ai proxy route handler.
 *
 * The built-in `@fal-ai/server-proxy/nextjs` `createRouteHandler` has a bug:
 * `responsePassthrough` returns the raw `fetch()` Response object, which still
 * carries the original `content-encoding` header from fal.ai (e.g. gzip/br).
 * Since Node's `fetch()` auto-decompresses the body, the browser receives an
 * already-decompressed body with a `content-encoding: gzip` header and throws
 * `ERR_CONTENT_DECODING_FAILED`.
 *
 * This custom handler re-creates the Response with cleaned headers.
 */

const FAL_KEY = process.env.FAL_KEY;
const TARGET_URL_HEADER = "x-fal-target-url";
const EXCLUDED_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
]);

async function handler(request: NextRequest) {
  const targetUrl = request.headers.get(TARGET_URL_HEADER);
  if (!targetUrl) {
    return NextResponse.json({ error: "Missing target URL" }, { status: 400 });
  }

  // Validate that the target URL is on a fal.ai domain
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid target URL" }, { status: 400 });
  }

  const host = parsedUrl.host;
  const isFalDomain =
    host === "fal.ai" ||
    host.endsWith(".fal.ai") ||
    host === "fal.run" ||
    host.endsWith(".fal.run");

  if (!isFalDomain) {
    return NextResponse.json(
      { error: "Target URL is not on a fal.ai domain" },
      { status: 412 },
    );
  }

  if (!FAL_KEY) {
    return NextResponse.json(
      { error: "FAL_KEY is not configured" },
      { status: 500 },
    );
  }

  // Forward x-fal-* headers
  const forwardHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("x-fal-") && key.toLowerCase() !== TARGET_URL_HEADER) {
      forwardHeaders[key.toLowerCase()] = value;
    }
  });

  const res = await fetch(targetUrl, {
    method: request.method,
    headers: {
      ...forwardHeaders,
      authorization: `Key ${FAL_KEY}`,
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": request.headers.get("user-agent") ?? "",
      "x-fal-client-proxy": "caraca/fal-proxy",
    },
    body: request.method === "GET" ? undefined : await request.text(),
  });

  // Build clean response headers (strip content-encoding, content-length, transfer-encoding)
  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    if (!EXCLUDED_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // Return a new Response with the decompressed body and clean headers
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
