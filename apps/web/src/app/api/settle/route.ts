/**
 * POST /api/settle — relay one matched trade to the escrow contract — Rahi, H10.5–H13.
 */
import { NextResponse } from 'next/server';
import { id as keccak } from 'ethers';
import type { SettlementReceipt } from '@sunshare/shared';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/bus';
import {
  explorerUrl,
  isChainConfigured,
  relaySettlement,
  type RelayedSettlement,
} from '@/lib/relayer';

export const dynamic = 'force-dynamic';

const kwhToWh = (kwh: number) => BigInt(Math.round(kwh * 1000));

/** uint64 slot number the contract can index by: minutes since the epoch. */
const slotNumber = (startSim: Date) => Math.floor(startSim.getTime() / 60_000);

export async function POST(req: Request) {
  let tradeId: unknown;
  try {
    ({ tradeId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof tradeId !== 'string' || !tradeId) {
    return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
  }

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { seller: true, buyer: true, slot: true, settlement: true },
  });

  if (!trade) {
    return NextResponse.json({ error: 'unknown trade' }, { status: 404 });
  }
  if (trade.settlement) {
    return NextResponse.json(
      { error: 'trade is already settled', detail: trade.settlement.txHash },
      { status: 409 },
    );
  }
  if (!trade.seller.walletAddress || !trade.buyer.walletAddress) {
    return NextResponse.json(
      { error: 'seller or buyer has no wallet address' },
      { status: 409 },
    );
  }

  const onChainId = keccak(trade.id);

  let relayed: RelayedSettlement;
  if (isChainConfigured()) {
    try {
      relayed = await relaySettlement({
        tradeId: onChainId,
        seller: trade.seller.walletAddress,
        buyer: trade.buyer.walletAddress,
        contractedWh: kwhToWh(trade.kwh),
        deliveredWh: kwhToWh(trade.deliveredKwh),
        pricePaisePerKwh: BigInt(trade.pricePaise),
        slot: slotNumber(trade.slot.startSim),
      });
    } catch (err) {
      // The demo must survive a dead RPC: record the settlement as simulated
      // and label it as such rather than failing the trade. Cut-list item #3.
      console.error('relay failed, falling back to simulated', err);
      relayed = {
        txHash: onChainId,
        blockNumber: 0,
        chainId: 0,
        gasUsed: '0',
        mode: 'simulated',
      };
    }
  } else {
    relayed = {
      txHash: onChainId,
      blockNumber: 0,
      chainId: 0,
      gasUsed: '0',
      mode: 'simulated',
    };
  }

  const settlement = await prisma.$transaction(async (tx) => {
    const created = await tx.settlement.create({
      data: {
        tradeId: trade.id,
        txHash: relayed.txHash,
        blockNumber: relayed.blockNumber,
        chainId: relayed.chainId,
        gasUsed: relayed.gasUsed,
        wheelingFeePaise: trade.wheelingFeePaise,
        explorerUrl: explorerUrl(relayed.txHash, relayed.mode),
        mode: relayed.mode,
      },
    });

    await tx.trade.update({
      where: { id: trade.id },
      data: { status: 'SETTLED' },
    });

    return created;
  });

  const receipt: SettlementReceipt = {
    tradeId: trade.id,
    txHash: settlement.txHash,
    blockNumber: settlement.blockNumber,
    chainId: settlement.chainId,
    gasUsed: settlement.gasUsed,
    wheelingFeePaise: settlement.wheelingFeePaise,
    merkleRoot: settlement.merkleRoot,
    explorerUrl: settlement.explorerUrl,
    settledAt: settlement.settledAt.toISOString(),
    mode: relayed.mode,
  };

  publish({ type: 'settlement', data: receipt });

  return NextResponse.json(receipt, { status: 201 });
}
