/**
 * GET/POST /api/bids — consumer demand bids — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  // TODO(Rahi): open bids for the current slot
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}

export async function POST(req: Request) {
  // TODO(Rahi): validate against Bid, reject maxPricePaise > retail tariff
  void req;
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
