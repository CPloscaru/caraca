import { NextResponse } from 'next/server';

type BalanceResponse = {
  configured: boolean;
  spent?: number;
  currency?: string;
  type?: 'spending';
  error?: boolean;
  adminKeyMissing?: boolean;
};

export async function GET() {
  const adminKey = process.env.FAL_KEY_ADMIN;
  const standardKey = process.env.FAL_KEY;

  // Need at least FAL_KEY to consider fal.ai as configured
  if (!standardKey) {
    return NextResponse.json<BalanceResponse>({ configured: false });
  }

  // Usage API requires an admin key
  if (!adminKey) {
    return NextResponse.json<BalanceResponse>({
      configured: true,
      type: 'spending',
      adminKeyMissing: true,
    });
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const url = new URL('https://api.fal.ai/v1/models/usage');
    url.searchParams.set('start', thirtyDaysAgo.toISOString());
    url.searchParams.set('end', now.toISOString());
    url.searchParams.set('expand', 'summary');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Key ${adminKey}` },
    });

    if (!res.ok) {
      return NextResponse.json<BalanceResponse>({ configured: true, error: true });
    }

    const data = await res.json();
    const summary = data?.summary ?? [];
    const totalSpent = summary.reduce(
      (acc: number, item: { cost?: number }) => acc + (item.cost ?? 0),
      0,
    );

    return NextResponse.json<BalanceResponse>({
      configured: true,
      spent: Math.round(totalSpent * 100) / 100,
      currency: 'USD',
      type: 'spending',
    });
  } catch {
    return NextResponse.json<BalanceResponse>({ configured: true, error: true });
  }
}
