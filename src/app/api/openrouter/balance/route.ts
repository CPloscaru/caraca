import { NextResponse } from 'next/server';

type BalanceResponse = {
  configured: boolean;
  balance?: number | null;
  usage?: number;
  currency?: string;
  type?: 'balance' | 'usage';
  error?: boolean;
};

export async function GET() {
  const key = process.env.OPENROUTER_KEY;
  if (!key) {
    return NextResponse.json<BalanceResponse>({ configured: false });
  }

  try {
    // Try credits endpoint first (requires management key)
    const creditsRes = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (creditsRes.ok) {
      const creditsData = await creditsRes.json();
      const balance = creditsData.data.total_credits - creditsData.data.total_usage;
      return NextResponse.json<BalanceResponse>({
        configured: true,
        balance: Math.round(balance * 10000) / 10000,
        currency: 'USD',
        type: 'balance',
      });
    }

    // Fallback to key info endpoint (works with standard keys)
    const keyRes = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!keyRes.ok) {
      return NextResponse.json<BalanceResponse>({ configured: true, error: true });
    }

    const keyData = await keyRes.json();
    const limitRemaining = keyData.data?.limit_remaining ?? null;
    const usage = keyData.data?.usage ?? 0;

    if (limitRemaining !== null) {
      return NextResponse.json<BalanceResponse>({
        configured: true,
        balance: limitRemaining,
        usage,
        currency: 'USD',
        type: 'balance',
      });
    }

    // No credit limit set -- can only report usage
    return NextResponse.json<BalanceResponse>({
      configured: true,
      balance: null,
      usage,
      currency: 'USD',
      type: 'usage',
    });
  } catch {
    return NextResponse.json<BalanceResponse>({ configured: true, error: true });
  }
}
