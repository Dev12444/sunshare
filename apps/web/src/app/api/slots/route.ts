/**
 * GET /api/slots — cleared slot history — Rahi.
 *
 * Feeds the price and volume charts. Only slots that actually cleared are
 * returned; an empty slot has no price to plot and would put a hole in the
 * series rather than a gap the chart can reason about.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;

export interface ClearedSlot {
  slotId: string;
  startSim: string;
  endSim: string;
  clearingPricePaise: number;
  totalSupplyKwh: number;
  totalDemandKwh: number;
  congestionIndex: number;
  merkleRoot: string | null;
  tradeCount: number;
  volumeKwh: number;
  co2AvoidedKg: number;
}

export async function GET(req: Request) {
  const limit = Math.min(
    Number(new URL(req.url).searchParams.get('limit') ?? 96) || 96,
    MAX_LIMIT,
  );

  const rows = await prisma.marketSlot.findMany({
    where: { clearingPricePaise: { not: null } },
    include: { trades: { select: { deliveredKwh: true, co2AvoidedKg: true } } },
    orderBy: { startSim: 'desc' },
    take: limit,
  });

  // Oldest first, so a chart can plot it without reversing.
  const slots: ClearedSlot[] = rows.reverse().map((s) => ({
    slotId: s.id,
    startSim: s.startSim.toISOString(),
    endSim: s.endSim.toISOString(),
    clearingPricePaise: s.clearingPricePaise!,
    totalSupplyKwh: s.totalSupplyKwh,
    totalDemandKwh: s.totalDemandKwh,
    congestionIndex: s.congestionIndex,
    merkleRoot: s.merkleRoot,
    tradeCount: s.trades.length,
    volumeKwh: s.trades.reduce((sum, t) => sum + t.deliveredKwh, 0),
    co2AvoidedKg: s.trades.reduce((sum, t) => sum + t.co2AvoidedKg, 0),
  }));

  return NextResponse.json(slots);
}
