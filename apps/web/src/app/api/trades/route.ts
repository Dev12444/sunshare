/**
 * GET /api/trades — settled trade history — Rahi.
 *
 * The SSE stream only carries what happens while a client is listening, so
 * without this the ledger, the impact page and every price chart are empty on
 * load and lose their history on refresh. This is the backfill they read once,
 * before subscribing to /api/events for anything new.
 */
import { NextResponse } from 'next/server';
import type { SettlementReceipt, TradeRecord } from '@sunshare/shared';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 500;

export interface TradeWithSettlement extends TradeRecord {
  settlement: SettlementReceipt | null;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const limit = Math.min(Number(params.get('limit') ?? 100) || 100, MAX_LIMIT);
  const slotId = params.get('slotId');
  const userId = params.get('userId');

  const rows = await prisma.trade.findMany({
    where: {
      ...(slotId ? { slotId } : {}),
      // Either side of the trade counts as "mine".
      ...(userId ? { OR: [{ sellerId: userId }, { buyerId: userId }] } : {}),
    },
    include: { settlement: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const trades: TradeWithSettlement[] = rows.map((t) => ({
    id: t.id,
    slotId: t.slotId,
    sellerId: t.sellerId,
    buyerId: t.buyerId,
    kwh: t.kwh,
    deliveredKwh: t.deliveredKwh,
    pricePaise: t.pricePaise,
    grossPaise: t.grossPaise,
    wheelingFeePaise: t.wheelingFeePaise,
    netToSellerPaise: t.netToSellerPaise,
    efficiencyPct: t.efficiencyPct,
    co2AvoidedKg: t.co2AvoidedKg,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    settlement: t.settlement
      ? {
          tradeId: t.id,
          txHash: t.settlement.txHash,
          blockNumber: t.settlement.blockNumber,
          chainId: t.settlement.chainId,
          gasUsed: t.settlement.gasUsed,
          wheelingFeePaise: t.settlement.wheelingFeePaise,
          merkleRoot: t.settlement.merkleRoot,
          explorerUrl: t.settlement.explorerUrl,
          settledAt: t.settlement.settledAt.toISOString(),
          mode: t.settlement.mode as SettlementReceipt['mode'],
        }
      : null,
  }));

  return NextResponse.json(trades);
}
