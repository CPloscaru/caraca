import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.FAL_KEY;
  if (!key) {
    return NextResponse.json({ status: "missing" });
  }
  return NextResponse.json({ status: "configured" });
}

export async function POST() {
  const key = process.env.FAL_KEY;
  if (!key) {
    return NextResponse.json({ status: "missing", valid: false });
  }

  try {
    // Validate key using the fal.ai queue endpoint.
    // A 401 means the key is invalid; any other response means it works.
    // The /tokens/ endpoint from research was LOW confidence, so we use
    // the queue endpoint which reliably returns auth errors for bad keys.
    const res = await fetch(
      "https://queue.fal.run/fal-ai/flux/requests",
      {
        method: "GET",
        headers: { Authorization: `Key ${key}` },
      }
    );

    // 401 = invalid key, anything else (200, 404, etc.) = key is valid
    const valid = res.status !== 401;
    return NextResponse.json({ status: "configured", valid });
  } catch {
    // Network error — cannot validate
    return NextResponse.json({ status: "configured", valid: false });
  }
}
