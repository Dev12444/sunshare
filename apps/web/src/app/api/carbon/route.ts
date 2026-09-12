/**
 * GET /api/carbon — personal carbon summary + badge progress — Rahi, H17–H19.
 */
import { NextResponse } from 'next/server';
import { badgesFor, carbonSummaryFor, networkCarbonKg } from '@/lib/carbon';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get('userId');
  const userId = requested ?? (await getSessionUser())?.id;

  if (!userId) {
    return NextResponse.json(
      { error: 'no active session', detail: 'pass ?userId= or switch role first' },
      { status: 401 },
    );
  }

  const [summary, badges, networkKg] = await Promise.all([
    carbonSummaryFor(userId),
    badgesFor(userId),
    networkCarbonKg(),
  ]);

  // Network total comes from Trade, not from summing the ledger — the ledger
  // credits both sides of a trade and would double count. See lib/carbon.ts.
  return NextResponse.json({ summary, badges, networkCo2AvoidedKg: networkKg });
}
