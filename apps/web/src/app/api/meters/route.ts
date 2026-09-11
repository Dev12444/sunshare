/**
 * GET /api/meters — meter registry + latest reading per meter — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  // TODO(Rahi): prisma.meter.findMany({ include: { latestReading: true } })
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
