/**
 * GET/POST /api/bids — consumer demand orders — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';
import type { Bid } from '@sunshare/shared';
import { DEFAULT_TARIFF } from '@sunshare/shared';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { currentSlotWindow, ensureCurrentSlot } from '@/lib/slot';

export const dynamic = 'force-dynamic';

type Row = Awaited<ReturnType<typeof prisma.bid.findMany>>[number];

function toBid(row: Row): Bid {
  return {
    id: row.id,
    buyerId: row.buyerId,
    meterId: row.meterId,
    nodeId: row.nodeId,
    kwh: row.kwh,
    maxPricePaise: row.maxPricePaise,
    slotId: row.slotId,
    status: row.status,
  };
}

export async function GET() {
  const rows = await prisma.bid.findMany({
    where: { slotId: currentSlotWindow().id, status: 'OPEN' },
    orderBy: { maxPricePaise: 'desc' },
  });

  return NextResponse.json(rows.map(toBid));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'no active session' }, { status: 401 });
  }

  let body: { kwh?: unknown; maxPricePaise?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const kwh = Number(body.kwh);
  const maxPricePaise = Math.round(Number(body.maxPricePaise));

  if (!Number.isFinite(kwh) || kwh <= 0) {
    return NextResponse.json({ error: 'kwh must be a positive number' }, { status: 400 });
  }
  if (!Number.isFinite(maxPricePaise)) {
    return NextResponse.json({ error: 'maxPricePaise must be a number' }, { status: 400 });
  }

  // Rejected rather than clamped: a buyer willing to pay above retail has
  // misunderstood the product, and silently lowering their bid would hide that.
  if (maxPricePaise > DEFAULT_TARIFF.retailTariffPaise) {
    return NextResponse.json(
      {
        error: 'maxPricePaise exceeds the retail tariff',
        detail: `the grid already sells at ${DEFAULT_TARIFF.retailTariffPaise} paise/kWh`,
      },
      { status: 422 },
    );
  }

  const meter = await prisma.meter.findFirst({ where: { userId: user.id } });
  if (!meter) {
    return NextResponse.json({ error: 'account has no meter' }, { status: 409 });
  }

  const slot = await ensureCurrentSlot();

  const row = await prisma.bid.create({
    data: {
      buyerId: user.id,
      meterId: meter.id,
      nodeId: meter.nodeId,
      kwh,
      maxPricePaise,
      slotId: slot.id,
    },
  });

  return NextResponse.json({ bid: toBid(row) }, { status: 201 });
}
