/**
 * POST /api/settle — relay one matched trade to the escrow contract — Rahi, H10.5–H13.
 */
import { NextResponse } from 'next/server';
import { settleTrade } from '@/lib/settlement';

export const dynamic = 'force-dynamic';

const STATUS = {
  UNKNOWN_TRADE: 404,
  ALREADY_SETTLED: 409,
  NO_WALLET: 409,
} as const;

const MESSAGE = {
  UNKNOWN_TRADE: 'unknown trade',
  ALREADY_SETTLED: 'trade is already settled',
  NO_WALLET: 'seller or buyer has no wallet address',
} as const;

export async function POST(req: Request) {
  let tradeId: unknown;
  try {
    ({ tradeId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof tradeId !== 'string' || !tradeId) {
    return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
  }

  const outcome = await settleTrade(tradeId);

  if (!outcome.ok) {
    return NextResponse.json(
      { error: MESSAGE[outcome.code], detail: outcome.detail },
      { status: STATUS[outcome.code] },
    );
  }

  return NextResponse.json(outcome.receipt, { status: 201 });
}
