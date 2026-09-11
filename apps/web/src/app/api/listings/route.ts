/**
 * GET/POST /api/listings — prosumer surplus offers — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';
import type { Listing } from '@sunshare/shared';
import { DEFAULT_TARIFF } from '@sunshare/shared';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { currentSlotWindow, ensureCurrentSlot } from '@/lib/slot';

export const dynamic = 'force-dynamic';

type Row = Awaited<ReturnType<typeof prisma.listing.findMany>>[number];

function toListing(row: Row): Listing {
  return {
    id: row.id,
    sellerId: row.sellerId,
    meterId: row.meterId,
    nodeId: row.nodeId,
    kwh: row.kwh,
    askPricePaise: row.askPricePaise,
    slotId: row.slotId,
    expiresAtSim: row.expiresAtSim.toISOString(),
    status: row.status,
    brokerPolicyId: row.brokerPolicyId,
  };
}

export async function GET() {
  const rows = await prisma.listing.findMany({
    where: { slotId: currentSlotWindow().id, status: 'OPEN' },
    orderBy: { askPricePaise: 'asc' },
  });

  return NextResponse.json(rows.map(toListing));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'no active session' }, { status: 401 });
  }

  let body: { kwh?: unknown; askPricePaise?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const kwh = Number(body.kwh);
  const askedPaise = Number(body.askPricePaise);

  if (!Number.isFinite(kwh) || kwh <= 0) {
    return NextResponse.json({ error: 'kwh must be a positive number' }, { status: 400 });
  }
  if (!Number.isFinite(askedPaise)) {
    return NextResponse.json({ error: 'askPricePaise must be a number' }, { status: 400 });
  }

  const meter = await prisma.meter.findFirst({ where: { userId: user.id } });
  if (!meter) {
    return NextResponse.json({ error: 'account has no meter' }, { status: 409 });
  }

  // The corridor is an invariant, not a suggestion: an ask below the feed-in
  // tariff would leave the seller worse off than exporting to the grid, and one
  // above retail would leave the buyer worse off than importing from it.
  const askPricePaise = Math.min(
    Math.max(Math.round(askedPaise), DEFAULT_TARIFF.feedInTariffPaise),
    DEFAULT_TARIFF.retailTariffPaise,
  );

  const slot = await ensureCurrentSlot();

  const row = await prisma.listing.create({
    data: {
      sellerId: user.id,
      meterId: meter.id,
      nodeId: meter.nodeId,
      kwh,
      askPricePaise,
      slotId: slot.id,
      expiresAtSim: slot.endSim,
    },
  });

  return NextResponse.json(
    { listing: toListing(row), clamped: askPricePaise !== Math.round(askedPaise) },
    { status: 201 },
  );
}
