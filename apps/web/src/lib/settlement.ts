/**
 * Settlement — Rahi, H10.5–H13.
 *
 * Shared by POST /api/settle and the slot orchestrator, so a manually settled
 * trade and an orchestrated one go through exactly the same path.
 */
import { id as keccak } from 'ethers';
import type { SettlementReceipt } from '@sunshare/shared';
import { prisma } from './prisma';
import { publish } from './bus';
import { explorerUrl, isChainConfigured, relaySettlement, type RelayedSettlement } from './relayer';
import { kwhToWh } from './money';

export type SettleOutcome =
  | { ok: true; receipt: SettlementReceipt }
  | { ok: false; code: 'UNKNOWN_TRADE' | 'ALREADY_SETTLED' | 'NO_WALLET'; detail?: string };

/** uint64 slot number the contract can index by: minutes since the epoch. */
const slotNumber = (startSim: Date) => Math.floor(startSim.getTime() / 60_000);

function simulated(txHash: string): RelayedSettlement {
  return { txHash, blockNumber: 0, chainId: 0, gasUsed: '0', mode: 'simulated' };
}

export async function settleTrade(tradeId: string): Promise<SettleOutcome> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { seller: true, buyer: true, slot: true, settlement: true },
  });

  if (!trade) return { ok: false, code: 'UNKNOWN_TRADE' };
  if (trade.settlement) {
    return { ok: false, code: 'ALREADY_SETTLED', detail: trade.settlement.txHash };
  }
  if (!trade.seller.walletAddress || !trade.buyer.walletAddress) {
    return { ok: false, code: 'NO_WALLET' };
  }

  const onChainId = keccak(trade.id);

  let relayed: RelayedSettlement;
  if (isChainConfigured()) {
    try {
      relayed = await relaySettlement({
        tradeId: onChainId,
        seller: trade.seller.walletAddress,
        buyer: trade.buyer.walletAddress,
        contractedWh: BigInt(kwhToWh(trade.kwh)),
        deliveredWh: BigInt(kwhToWh(trade.deliveredKwh)),
        pricePaisePerKwh: BigInt(trade.pricePaise),
        slot: slotNumber(trade.slot.startSim),
      });
    } catch (err) {
      // The demo must survive a dead RPC: record the settlement as simulated
      // and label it, rather than failing the trade. Cut-list item #3.
      console.error('relay failed, falling back to simulated', err);
      relayed = simulated(onChainId);
    }
  } else {
    relayed = simulated(onChainId);
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

    await tx.trade.update({ where: { id: trade.id }, data: { status: 'SETTLED' } });

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

  return { ok: true, receipt };
}
