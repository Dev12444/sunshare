/**
 * GET/POST /api/community — beneficiary registry, donations, donor config — Rahi, H17–H19.
 */
import { NextResponse } from 'next/server';
import { communityOverview, setDonorConfig } from '@/lib/community';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await communityOverview());
}

/** A prosumer opts in and sets their own generosity. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'no active session' }, { status: 401 });
  }

  let body: { donationBps?: unknown; dailyThresholdKwh?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const donationBps = Math.round(Number(body.donationBps));
  const dailyThresholdKwh = Number(body.dailyThresholdKwh);

  if (!Number.isFinite(donationBps) || donationBps < 0 || donationBps > 10_000) {
    return NextResponse.json(
      { error: 'donationBps must be between 0 and 10000' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(dailyThresholdKwh) || dailyThresholdKwh < 0) {
    return NextResponse.json(
      { error: 'dailyThresholdKwh must be a non-negative number' },
      { status: 400 },
    );
  }

  try {
    const { txHash } = await setDonorConfig(user.id, donationBps, dailyThresholdKwh);

    return NextResponse.json({
      donorId: user.id,
      donationBps,
      dailyThresholdKwh,
      txHash,
      // Null means the pool is not wired up; the config was not stored anywhere,
      // which is worth the caller knowing rather than silently assuming success.
      onChain: txHash !== null,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'could not configure donor', detail }, { status: 502 });
  }
}
