/**
 * GET /api/carbon — CarbonSummary + badge progress for a user — Rahi, H17–H19.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  // TODO(Rahi): aggregate carbon_ledger, compute badge progress
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
