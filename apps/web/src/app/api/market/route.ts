/**
 * GET /api/market — current MarketState (network-first cached by the SW) — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  // TODO(Rahi): latest MarketState snapshot from the orchestrator
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
