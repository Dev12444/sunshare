/**
 * Trade orchestrator — Rahi, H13–H15.
 *
 * One slot, end to end: collect the order book, match it, persist the trades,
 * settle them, and announce each step on the SSE stream.
 *
 * Two rules from the engine's contract (docs/API_CONTRACTS.md) shape this file:
 *
 *  1. `/grid/topology` is fetched fresh on every run. It carries the live
 *     per-edge loads, and that is the only way congestion reaches the matcher.
 *     A cached topology still returns plausible matches — it just silently
 *     stops pricing congestion, which is worse than failing.
 *  2. The engine never persists anything. `/match` is a pure function of the
 *     body sent to it, so every row written below is this service's job.
 */
import type {
  Bid,
  GridTopology,
  Listing,
  MatchRequest,
  MatchResult,
  MeterReading,
  TradeRecord,
} from '@sunshare/shared';
import { CO2_AVOIDED_PER_KWH, DEFAULT_TARIFF } from '@sunshare/shared';
import { prisma } from './prisma';
import { publish } from './bus';
import { currentSlot, ensureCurrentSlot, type SlotWindow } from './slot';
import { settleTrade } from './settlement';
import { tradeMoney } from './money';
import { snapshotReadings } from './readings';
import { awardBadges, recordCarbonForTrades } from './carbon';
import { routeDonationsForSlot } from './community';
import { runBrokerForSlot } from './broker';
import { merkleRoot } from './merkle';
import { isChainConfigured, relaySlotCommitment } from './relayer';

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

/** Partial fills are normal, so compare consumed against offered with slack. */
const EPSILON_KWH = 1e-6;

export interface SlotRunResult {
  slotId: string;
  matched: boolean;
  reason?: string;
  clearingPricePaise?: number;
  tradesCreated: number;
  tradesSettled: number;
  donations?: number;
  donatedKwh?: number;
  badgesUnlocked?: number;
  brokerDecisions?: number;
  merkleRoot?: string | null;
  readingsCaptured?: number;
  totalDeliveredKwh?: number;
  avgEfficiencyPct?: number;
  algorithm?: MatchResult['algorithm'];
}

async function engineJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`engine ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** 0..1, the busiest edge on the network. */
function congestionIndexOf(grid: GridTopology): number {
  const utilisations = grid.edges
    .filter((e) => e.capacityKw > 0)
    .map((e) => e.currentLoadKw / e.capacityKw);

  return utilisations.length ? Math.min(1, Math.max(...utilisations)) : 0;
}

/**
 * Which slot to trade.
 *
 * The sim clock advances by `speed x real_seconds`, so at SIM_SPEED 60 a real
 * second is a sim hour and a 15-minute slot is gone in a quarter of a second.
 * Even at speed 1 a slot lasts 15 real seconds — less time than it takes a
 * person to list, switch role, bid, and hit run. Matching only ever the current
 * slot therefore strands perfectly good orders in a window that just closed.
 *
 * So: trade the caller's slot if they named one, else the current slot when it
 * has a book, else the most recent slot that actually has one.
 */
async function resolveSlot(explicitSlotId?: string): Promise<SlotWindow> {
  if (explicitSlotId) {
    const row = await prisma.marketSlot.findUnique({ where: { id: explicitSlotId } });
    if (!row) throw new Error(`unknown slot ${explicitSlotId}`);
    return { id: row.id, startSim: row.startSim, endSim: row.endSim };
  }

  const current = await ensureCurrentSlot();

  const [listings, bids] = await Promise.all([
    prisma.listing.count({ where: { slotId: current.id, status: 'OPEN' } }),
    prisma.bid.count({ where: { slotId: current.id, status: 'OPEN' } }),
  ]);
  if (listings > 0 && bids > 0) return current;

  const tradable = await prisma.marketSlot.findFirst({
    where: {
      listings: { some: { status: 'OPEN' } },
      bids: { some: { status: 'OPEN' } },
    },
    orderBy: { startSim: 'desc' },
  });

  if (!tradable) return current;

  if (tradable.id !== current.id) {
    console.warn(`current slot ${current.id} has no book; trading ${tradable.id} instead`);
  }

  return { id: tradable.id, startSim: tradable.startSim, endSim: tradable.endSim };
}

export async function runSlot(explicitSlotId?: string): Promise<SlotRunResult> {
  const slot = await resolveSlot(explicitSlotId);

  // Taken before matching so day-generation totals reflect the book being
  // matched, which is what the pool's donation thresholds are measured against.
  let readings: MeterReading[] = [];
  try {
    readings = await snapshotReadings(slot.startSim);
  } catch (err) {
    console.error('reading snapshot failed; continuing without it', err);
  }

  // Before collecting the book, so anything the broker lists or reprices this
  // slot is matched in the same run rather than waiting for the next one.
  let brokerDecisions = 0;
  try {
    brokerDecisions = (await runBrokerForSlot(slot)).length;
  } catch (err) {
    console.error('broker pass failed; continuing without it', err);
  }

  const [listingRows, bidRows] = await Promise.all([
    prisma.listing.findMany({ where: { slotId: slot.id, status: 'OPEN' } }),
    prisma.bid.findMany({ where: { slotId: slot.id, status: 'OPEN' } }),
  ]);

  if (listingRows.length === 0 || bidRows.length === 0) {
    return {
      slotId: slot.id,
      matched: false,
      reason: listingRows.length === 0 ? 'no open listings' : 'no open bids',
      tradesCreated: 0,
      tradesSettled: 0,
    };
  }

  const listings: Listing[] = listingRows.map((row) => ({
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
  }));

  const bids: Bid[] = bidRows.map((row) => ({
    id: row.id,
    buyerId: row.buyerId,
    meterId: row.meterId,
    nodeId: row.nodeId,
    kwh: row.kwh,
    maxPricePaise: row.maxPricePaise,
    slotId: row.slotId,
    status: row.status,
  }));

  // Commit the book before settling it, so the orders cannot be disputed after
  // the fact. Best effort: a failed commitment must not stop the slot trading.
  let bookRoot: string | null = null;
  if (isChainConfigured()) {
    try {
      bookRoot = merkleRoot([
        ...listings.map((l) => ({
          kind: 'listing' as const,
          id: l.id,
          party: l.sellerId,
          nodeId: l.nodeId,
          kwh: l.kwh,
          pricePaise: l.askPricePaise,
        })),
        ...bids.map((b) => ({
          kind: 'bid' as const,
          id: b.id,
          party: b.buyerId,
          nodeId: b.nodeId,
          kwh: b.kwh,
          pricePaise: b.maxPricePaise,
        })),
      ]);

      await relaySlotCommitment(
        Math.floor(slot.startSim.getTime() / 60_000),
        bookRoot,
        listings.length + bids.length,
      );
    } catch (err) {
      console.error('slot commitment failed; trading anyway', err);
      bookRoot = null;
    }
  }

  // Rule 1 — fresh, never cached.
  const grid = await engineJson<GridTopology>('/grid/topology');

  const request: MatchRequest = {
    slotId: slot.id,
    listings,
    bids,
    grid,
    tariff: DEFAULT_TARIFF,
  };

  const result = await engineJson<MatchResult>('/match', {
    method: 'POST',
    body: JSON.stringify(request),
  });

  const price = result.clearingPricePaise;

  // Defence in depth: the contract rejects an out-of-corridor price with a
  // revert, which is a far worse way to discover it than refusing here.
  if (price < DEFAULT_TARIFF.feedInTariffPaise || price > DEFAULT_TARIFF.retailTariffPaise) {
    throw new Error(
      `clearing price ${price} outside corridor ` +
        `[${DEFAULT_TARIFF.feedInTariffPaise}, ${DEFAULT_TARIFF.retailTariffPaise}]`,
    );
  }

  if (result.pairs.length === 0) {
    return {
      slotId: slot.id,
      matched: false,
      reason: 'no crossing between asks and bids',
      clearingPricePaise: price,
      tradesCreated: 0,
      tradesSettled: 0,
      algorithm: result.algorithm,
    };
  }

  const consumedByListing = new Map<string, number>();
  const consumedByBid = new Map<string, number>();
  for (const pair of result.pairs) {
    consumedByListing.set(pair.listingId, (consumedByListing.get(pair.listingId) ?? 0) + pair.kwh);
    consumedByBid.set(pair.bidId, (consumedByBid.get(pair.bidId) ?? 0) + pair.kwh);
  }

  const offeredByListing = new Map(listingRows.map((r) => [r.id, r.kwh]));
  const wantedByBid = new Map(bidRows.map((r) => [r.id, r.kwh]));

  const trades = await prisma.$transaction(async (tx) => {
    await tx.marketSlot.update({
      where: { id: slot.id },
      data: {
        clearingPricePaise: price,
        totalSupplyKwh: listingRows.reduce((sum, r) => sum + r.kwh, 0),
        totalDemandKwh: bidRows.reduce((sum, r) => sum + r.kwh, 0),
        congestionIndex: congestionIndexOf(grid),
        merkleRoot: bookRoot,
      },
    });

    const created = [];
    for (const pair of result.pairs) {
      const money = tradeMoney(
        pair.deliveredKwh,
        price,
        DEFAULT_TARIFF.wheelingChargePaise,
      );

      created.push(
        await tx.trade.create({
          data: {
            slotId: slot.id,
            sellerId: pair.sellerId,
            buyerId: pair.buyerId,
            kwh: pair.kwh,
            deliveredKwh: pair.deliveredKwh,
            pricePaise: price,
            grossPaise: money.grossPaise,
            wheelingFeePaise: money.wheelingFeePaise,
            netToSellerPaise: money.netToSellerPaise,
            efficiencyPct: pair.efficiencyPct,
            co2AvoidedKg: pair.deliveredKwh * CO2_AVOIDED_PER_KWH,
          },
        }),
      );
    }

    for (const [listingId, consumed] of consumedByListing) {
      const offered = offeredByListing.get(listingId) ?? 0;
      await tx.listing.update({
        where: { id: listingId },
        data: { status: consumed + EPSILON_KWH >= offered ? 'MATCHED' : 'PARTIAL' },
      });
    }

    for (const [bidId, consumed] of consumedByBid) {
      const wanted = wantedByBid.get(bidId) ?? 0;
      await tx.bid.update({
        where: { id: bidId },
        data: { status: consumed + EPSILON_KWH >= wanted ? 'MATCHED' : 'PARTIAL' },
      });
    }

    await recordCarbonForTrades(tx, created);

    return created;
  });

  publish({ type: 'match', data: result });

  for (const trade of trades) {
    const record: TradeRecord = {
      id: trade.id,
      slotId: trade.slotId,
      sellerId: trade.sellerId,
      buyerId: trade.buyerId,
      kwh: trade.kwh,
      deliveredKwh: trade.deliveredKwh,
      pricePaise: trade.pricePaise,
      grossPaise: trade.grossPaise,
      wheelingFeePaise: trade.wheelingFeePaise,
      netToSellerPaise: trade.netToSellerPaise,
      efficiencyPct: trade.efficiencyPct,
      co2AvoidedKg: trade.co2AvoidedKg,
      status: trade.status,
      createdAt: trade.createdAt.toISOString(),
    };
    publish({ type: 'trade', data: record });
  }

  // One failed settlement must not abandon the rest of the slot's trades.
  let tradesSettled = 0;
  for (const trade of trades) {
    const outcome = await settleTrade(trade.id);
    if (outcome.ok) tradesSettled += 1;
    else console.error(`settlement failed for ${trade.id}: ${outcome.code}`);
  }

  // After settlement: donations are a share of what was actually delivered.
  const donations = await routeDonationsForSlot(trades, readings, slot);

  // Last, so a donation made this slot can unlock the community badge now
  // rather than a slot later.
  const participants = trades.flatMap((t) => [t.sellerId, t.buyerId]);
  const badgesUnlocked = await awardBadges(participants);

  return {
    slotId: slot.id,
    matched: true,
    clearingPricePaise: price,
    tradesCreated: trades.length,
    tradesSettled,
    donations: donations.length,
    donatedKwh: donations.reduce((sum, d) => sum + d.kwh, 0),
    badgesUnlocked,
    brokerDecisions,
    merkleRoot: bookRoot,
    readingsCaptured: readings.length,
    totalDeliveredKwh: result.totalDeliveredKwh,
    avgEfficiencyPct: result.avgEfficiencyPct,
    algorithm: result.algorithm,
  };
}

/** Exposed for the demo trigger; keeps the route thin. */
export async function currentSlotId(): Promise<string> {
  return (await currentSlot()).id;
}
