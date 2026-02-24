import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for fal.ai OpenAPI schema endpoint.
 * The schema endpoint is public (no auth needed) but has CORS restrictions,
 * so we proxy it through this server-side route.
 */
export async function GET(request: NextRequest) {
  const endpointId = request.nextUrl.searchParams.get("endpoint_id");
  if (!endpointId) {
    return NextResponse.json(
      { error: "Missing endpoint_id parameter" },
      { status: 400 },
    );
  }

  const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpointId)}`;

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch schema" },
      { status: 502 },
    );
  }
}
