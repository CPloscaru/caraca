import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/validation";

/**
 * Proxy for fal.ai OpenAPI schema endpoint.
 * The schema endpoint is public (no auth needed) but has CORS restrictions,
 * so we proxy it through this server-side route.
 */
export async function GET(request: NextRequest) {
  const endpointId = request.nextUrl.searchParams.get("endpoint_id");
  if (!endpointId) {
    return apiError(400, "Missing endpoint_id parameter");
  }

  const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpointId)}`;

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      return apiError(res.status, `Upstream returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return apiError(502, "Failed to fetch schema");
  }
}
