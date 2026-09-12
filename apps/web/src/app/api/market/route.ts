/**
 * GET /api/market — current MarketState (network-first cached by the SW) — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';
import type { MarketState } from '@sunshare/shared';
import { BASE_PRICE_PAISE } from '@sunshare/shared';
import { prisma } from '@/lib/prisma';
import { currentSlot } from '@/lib/slot';

export const dynamic = 'force-dynamic';

export async function GET() {
  const slot = await currentSlot();
  const openInSlot = { slotId: slot.id, status: 'OPEN' } as const;

  const [supply, demand, lastCleared] = await Promise.all([
    prisma.listing.aggregate({
      where: openInSlot,
      _sum: { kwh: true },
      _count: true,
    }),
    prisma.bid.aggregate({
      where: openInSlot,
      _sum: { kwh: true },
      _count: true,
    }),
    prisma.marketSlot.findFirst({
      where: { clearingPricePaise: { not: null } },
      orderBy: { startSim: 'desc' },
      select: { clearingPricePaise: true },
    }),
  ]);

  const lastClearingPricePaise = lastCleared?.clearingPricePaise ?? null;

  const state: MarketState = {
    slotId: slot.id,
    slotStartSim: slot.startSim.toISOString(),
    slotEndSim: slot.endSim.toISOString(),
    totalSupplyKwh: supply._sum.kwh ?? 0,
    totalDemandKwh: demand._sum.kwh ?? 0,
    // Last cleared price is the better reference once the auction has run;
    // before that the corridor midpoint is all we can honestly quote.
    indicativePricePaise: lastClearingPricePaise ?? BASE_PRICE_PAISE,
    lastClearingPricePaise,
    // Needs the engine's edge-utilisation model; 0 until the grid graph lands.
    congestionIndex: 0,
    activeListings: supply._count,
    activeBids: demand._count,
  };

  return NextResponse.json(state);
}
