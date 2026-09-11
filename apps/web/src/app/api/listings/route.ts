/**
 * GET/POST /api/listings — prosumer surplus offers — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  // TODO(Rahi): open listings for the current slot
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}

export async function POST(req: Request) {
  // TODO(Rahi): validate against Listing, clamp askPricePaise into the corridor
  void req;
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
