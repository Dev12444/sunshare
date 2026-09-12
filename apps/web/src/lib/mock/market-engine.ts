/**
 * Deterministic market engine for the mock layer.
 *
 * Every number the UI shows with NEXT_PUBLIC_USE_MOCKS=true comes from here.
 * It is a pure function of (seed, simulated time): the same demo run twice
 * produces identical prices, trades and hashes, which is what makes a live
 * pitch safe. It mirrors the engine's rules rather than approximating them —
 * the same solar geometry, the same uniform-price auction, the same corridor
 * clamp, the same hop-tiered losses.
 *
 * What it deliberately does NOT do is invent a different market shape from the
 * real backend. When mocks are switched off, the same components render the
 * same fields from the same types.
 */
import {
  BASE_PRICE_PAISE,
  CO2_AVOIDED_PER_KWH,
  DEFAULT_TARIFF,
  SLOT_MINUTES,
  type Bid,
  type BrokerDecision,
  type BrokerPolicy,
  type CommunityDonation,
  type GridEdge,
  type GridNode,
  type GridTopology,
  type Listing,
  type MarketState,
  type MatchPair,
  type MatchResult,
  type MeterReading,
  type SettlementReceipt,
  type Tick,
  type TradeRecord,
  type WeatherSnapshot,
} from '@sunshare/shared';
import { clampToCorridor, transmissionLossPct } from '@/lib/domain';
import { rngFrom, seeded } from '@/lib/rng';
import {
  BENEFICIARIES,
  EDGES,
  HOUSEHOLDS,
  NODES,
  NODE_BY_ID,
  displayName,
} from '@/lib/seed';
import {
  clearSkyIrradiance,
  consumptionKw,
  generationKw,
  solarElevationDeg,
} from '@/lib/solar';
import { hopTier, pathBetween, pathEdgeIds, pathLengthKm } from './grid-path';

/* ------------------------------------------------------------------ setup */

/** The simulated day. Fixed so the whole demo is reproducible. */
export const SIM_DATE = '2026-09-12';
export const SIM_DAY_OF_YEAR = 255;
export const SIM_TZ = '+05:30';

/** Ticks begin at 06:00 so the solar-day chart has a full morning behind it. */
export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 23 * 60 + 45;

/**
 * The demo opens at the middle of the trading day.
 *
 * This is where the market is actually interesting: rooftops are past peak but
 * still well ahead of household load, and the school and the general store are
 * drawing hard — so there is real demand to match surplus against rather than
 * the token volumes an all-residential evening produces. The evening ramp is
 * one jump button away for the broker's "sell before sunset" story.
 */
export const DEFAULT_START_MIN = 12 * 60 + 34;

/**
 * Unmetered premises hanging off each feeder.
 *
 * The twelve instrumented houses are a pilot inside a real neighbourhood — the
 * rest of the feeder's load is not on the platform but is absolutely on the
 * wire. Without it every feeder would sit at 5% utilisation and "congestion"
 * would be a word with no picture behind it.
 */
const FEEDER_BACKGROUND: Record<string, { premises: number; archetype: string }> = {
  'F-1': { premises: 22, archetype: 'FAMILY_3' },
  'F-2': { premises: 31, archetype: 'FAMILY_4' },
  'F-3': { premises: 18, archetype: 'FAMILY_3' },
  'F-4': { premises: 14, archetype: 'COUPLE' },
};

export function simIso(minutes: number, seconds = 0): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes) % 60;
  const s = Math.floor(seconds) % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${SIM_DATE}T${p(h)}:${p(m)}:${p(s)}${SIM_TZ}`;
}

export function slotIdFor(minutes: number): string {
  const start = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
  return simIso(start).slice(0, 16);
}

export function slotIndexFor(minutes: number): number {
  return Math.floor(minutes / SLOT_MINUTES);
}

/* ---------------------------------------------------------------- weather */

/**
 * Cloud cover for the simulated day: a broken-cloud morning that clears by
 * early afternoon, with a band of high cloud around 15:00. Seeded, so the dip
 * in generation always lands in the same place in the pitch.
 */
const weatherCache = new Map<number, WeatherSnapshot>();

export function weatherAt(minutes: number): WeatherSnapshot {
  const key = Math.round(minutes * 4) / 4;
  const hit = weatherCache.get(key);
  if (hit) return hit;
  const value = computeWeather(key);
  weatherCache.set(key, value);
  return value;
}

function computeWeather(minutes: number): WeatherSnapshot {
  const h = minutes / 60;
  const band = 26 + 22 * Math.sin((h - 5) / 3.4) + 16 * Math.exp(-(((h - 15.1) / 1.1) ** 2));
  const noise = (seeded(`cloud:${Math.floor(minutes / 20)}`) - 0.5) * 7;
  const cloudCoverPct = Math.max(2, Math.min(88, band + noise));

  const elevation = solarElevationDeg(h, SIM_DAY_OF_YEAR);
  const irradianceWm2 = clearSkyIrradiance(elevation) * (1 - 0.75 * (cloudCoverPct / 100));
  const tempC = 24.5 + 8.5 * Math.exp(-(((h - 14.6) / 4.1) ** 2)) - 1.4 * (cloudCoverPct / 100);

  return {
    cloudCoverPct: Math.round(cloudCoverPct * 10) / 10,
    irradianceWm2: Math.round(irradianceWm2),
    tempC: Math.round(tempC * 10) / 10,
    source: 'synthetic',
  };
}

/* ----------------------------------------------------------------- meters */

export interface Reading extends MeterReading {
  name: string;
  shortName: string;
  panelKw: number;
  role: 'PROSUMER' | 'CONSUMER';
}

const readingCache = new Map<number, Reading[]>();

export function readingsAt(minutes: number): Reading[] {
  const key = Math.round(minutes * 4) / 4;
  const hit = readingCache.get(key);
  if (hit) return hit;
  const value = computeReadings(key);
  readingCache.set(key, value);
  if (readingCache.size > 600) readingCache.delete(readingCache.keys().next().value as number);
  return value;
}

function computeReadings(minutes: number): Reading[] {
  const weather = weatherAt(minutes);
  const h = minutes / 60;
  const slot = slotIdFor(minutes);

  return HOUSEHOLDS.map((hh) => {
    // Noise is seeded per meter per slot: different across houses, identical
    // across runs. Matches the engine's `Random(f"{seed}:{meter}:{slot}")`.
    const jitter = 0.88 + rngFrom(`${hh.meterId}:${slot}`)() * 0.24;
    const generationKwValue = generationKw(
      hh.panelKw,
      weather.irradianceWm2,
      weather.cloudCoverPct,
      weather.tempC,
    );
    const consumption = consumptionKw(hh.archetype, h, jitter);

    return {
      meterId: hh.meterId,
      userId: hh.userId,
      nodeId: hh.nodeId,
      generationKw: round(generationKwValue, 4),
      consumptionKw: round(consumption, 4),
      surplusKw: round(generationKwValue - consumption, 4),
      dayGenerationKwh: round(dayGenerationKwh(hh.panelKw, minutes), 3),
      name: hh.name,
      shortName: hh.shortName,
      panelKw: hh.panelKw,
      role: hh.role,
    };
  });
}

/**
 * Cumulative generation from the start of the simulated day.
 *
 * Integrated at 5-minute steps and memoised per (panel, minute) — it is read
 * twelve times a second by the tick loop and the Robin Hood thresholds depend
 * on it, so recomputing the whole morning each time is not an option.
 */
const dayGenCache = new Map<string, number>();

function dayGenerationKwh(panelKw: number, minutes: number): number {
  if (panelKw <= 0) return 0;
  const bucket = Math.floor(minutes / 5) * 5;
  const key = `${panelKw}:${bucket}`;
  const hit = dayGenCache.get(key);
  if (hit !== undefined) return hit;

  let total = 0;
  for (let m = DAY_START_MIN; m < bucket; m += 5) {
    const w = weatherAt(m);
    total += generationKw(panelKw, w.irradianceWm2, w.cloudCoverPct, w.tempC) * (5 / 60);
  }
  dayGenCache.set(key, total);
  return total;
}

/* ------------------------------------------------------------------- grid */

export function topologyAt(minutes: number, stressedEdges: string[] = []): GridTopology {
  const readings = readingsAt(minutes);
  const byNode = new Map(readings.map((r) => [r.nodeId, r]));
  const h = minutes / 60;

  const nodes: GridNode[] = NODES.map((n) => ({ ...n, loadKw: 0 }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeLoad = new Map<string, number>();

  // Houses first: net draw on the wire is consumption minus own generation.
  for (const n of nodes) {
    if (n.kind !== 'HOUSE') continue;
    const r = byNode.get(n.id);
    n.loadKw = r ? round(r.consumptionKw - r.generationKw, 3) : 0;
  }

  // Feeders carry their houses plus the unmetered background load.
  for (const n of nodes) {
    if (n.kind !== 'FEEDER') continue;
    const bg = FEEDER_BACKGROUND[n.id];
    const background = bg
      ? bg.premises *
        consumptionKw(bg.archetype, h, 0.94 + seeded(`bg:${n.id}:${Math.floor(minutes / 15)}`) * 0.12)
      : 0;
    const children = nodes.filter((c) => c.parentId === n.id);
    n.loadKw = round(background + children.reduce((s, c) => s + Math.max(0, c.loadKw), 0), 3);
  }

  for (const n of nodes) {
    if (n.kind !== 'SUBSTATION') continue;
    const children = nodes.filter((c) => c.parentId === n.id && c.kind !== 'SUBSTATION');
    n.loadKw = round(children.reduce((s, c) => s + Math.max(0, c.loadKw), 0), 3);
  }

  for (const e of EDGES) {
    const child = nodeById.get(e.toNodeId);
    edgeLoad.set(e.id, Math.max(0, child?.loadKw ?? 0));
  }
  // SS-1 -> SS-2 carries everything downstream of SS-2.
  const ss2 = nodeById.get('SS-2');
  if (ss2) edgeLoad.set('e-SS-1-SS-2', Math.max(0, ss2.loadKw));

  const edges: GridEdge[] = EDGES.map((e) => ({
    ...e,
    currentLoadKw: stressedEdges.includes(e.id)
      ? round(e.capacityKw * 0.97, 3)
      : round(edgeLoad.get(e.id) ?? 0, 3),
  }));

  return { nodes, edges };
}

export function congestionIndexOf(topology: GridTopology): number {
  const utils = topology.edges.map((e) =>
    e.capacityKw > 0 ? e.currentLoadKw / e.capacityKw : 0,
  );
  if (utils.length === 0) return 0;
  // Weighted towards the worst edge: one saturated feeder is a network problem,
  // not something an average should be allowed to hide.
  const max = Math.max(...utils);
  const mean = utils.reduce((s, u) => s + u, 0) / utils.length;
  return Math.max(0, Math.min(1, 0.65 * max + 0.35 * mean));
}

/* ------------------------------------------------------------ order book */

export interface SlotOrders {
  slotId: string;
  slotIndex: number;
  listings: Listing[];
  bids: Bid[];
}

/**
 * The book a slot opens with.
 *
 * Prosumers offer the surplus they expect over the slot, holding back a
 * reserve. Consumers bid their expected deficit. Ask and bid prices are drawn
 * inside the corridor around the indicative price — sellers anchored above it,
 * buyers below their retail ceiling.
 */
export function ordersForSlot(slotIndex: number, policy: BrokerPolicy | null): SlotOrders {
  const startMin = slotIndex * SLOT_MINUTES;
  const midMin = startMin + SLOT_MINUTES / 2;
  const slotId = simIso(startMin).slice(0, 16);
  const readings = readingsAt(midMin);

  const listings: Listing[] = [];
  const bids: Bid[] = [];

  let supply = 0;
  let demand = 0;
  for (const r of readings) {
    const energy = (r.surplusKw * SLOT_MINUTES) / 60;
    if (energy > 0) supply += energy;
    else demand += -energy;
  }
  const indicative = indicativePrice(supply, demand, 0);

  for (const r of readings) {
    const energyKwh = (r.surplusKw * SLOT_MINUTES) / 60;
    const rnd = rngFrom(`order:${r.meterId}:${slotIndex}`);

    if (energyKwh > 0.05) {
      const reserveFactor = policy && policy.userId === r.userId ? 0.98 : 0.9 + rnd() * 0.08;
      const kwh = round(energyKwh * reserveFactor, 2);
      if (kwh < 0.05) continue;
      const spread = 0.9 + rnd() * 0.3;
      let ask = clampToCorridor(Math.round(indicative * spread), DEFAULT_TARIFF);
      if (policy && policy.userId === r.userId) {
        ask = clampToCorridor(Math.max(ask, policy.minPricePaise), DEFAULT_TARIFF);
      }
      listings.push({
        id: `L-${slotIndex}-${r.meterId}`,
        sellerId: r.userId,
        meterId: r.meterId,
        nodeId: r.nodeId,
        kwh,
        askPricePaise: ask,
        slotId,
        expiresAtSim: simIso(startMin + SLOT_MINUTES),
        status: 'OPEN',
        brokerPolicyId: policy && policy.userId === r.userId ? policy.id : null,
      });
    } else if (-energyKwh > 0.05) {
      const kwh = round(-energyKwh * (0.94 + rnd() * 0.1), 2);
      if (kwh < 0.05) continue;
      // A buyer never bids above retail — that is the point of the corridor.
      const willingness = 0.86 + rnd() * 0.13;
      bids.push({
        id: `B-${slotIndex}-${r.meterId}`,
        buyerId: r.userId,
        meterId: r.meterId,
        nodeId: r.nodeId,
        kwh,
        maxPricePaise: clampToCorridor(
          Math.round(DEFAULT_TARIFF.retailTariffPaise * willingness),
          DEFAULT_TARIFF,
        ),
        slotId,
        status: 'OPEN',
      });
    }
  }

  return { slotId, slotIndex, listings, bids };
}

/** Reference price before a slot clears. Ported from pricing.indicative_price. */
export function indicativePrice(
  supplyKwh: number,
  demandKwh: number,
  congestion: number,
): number {
  const t = DEFAULT_TARIFF;
  const corridor = t.retailTariffPaise - t.feedInTariffPaise;
  const base = (t.feedInTariffPaise + t.retailTariffPaise) / 2;
  const total = supplyKwh + demandKwh;
  if (total <= 1e-9) return clampToCorridor(Math.round(base), t);
  const imbalance = (demandKwh - supplyKwh) / total;
  let price = base + 0.35 * corridor * imbalance;
  price += 0.15 * corridor * Math.max(0, Math.min(congestion, 1));
  return clampToCorridor(Math.round(price), t);
}

/** Uniform-price double auction. Ported from pricing.clear_slot. */
export function clearSlot(
  listings: Listing[],
  bids: Bid[],
): { pricePaise: number; volumeKwh: number } {
  const asks = [...listings]
    .filter((l) => l.kwh > 0)
    .sort((a, b) => a.askPricePaise - b.askPricePaise);
  const offers = [...bids]
    .filter((b) => b.kwh > 0)
    .sort((a, b) => b.maxPricePaise - a.maxPricePaise);

  if (asks.length === 0 || offers.length === 0) {
    return { pricePaise: clampToCorridor(BASE_PRICE_PAISE, DEFAULT_TARIFF), volumeKwh: 0 };
  }

  let i = 0;
  let j = 0;
  let askLeft = asks[0].kwh;
  let bidLeft = offers[0].kwh;
  let volume = 0;
  let lastAsk: number | null = null;
  let lastBid: number | null = null;

  while (i < asks.length && j < offers.length) {
    if (offers[j].maxPricePaise < asks[i].askPricePaise) break;
    const traded = Math.min(askLeft, bidLeft);
    volume += traded;
    askLeft -= traded;
    bidLeft -= traded;
    lastAsk = asks[i].askPricePaise;
    lastBid = offers[j].maxPricePaise;
    if (askLeft <= 1e-9) {
      i += 1;
      if (i < asks.length) askLeft = asks[i].kwh;
    }
    if (bidLeft <= 1e-9) {
      j += 1;
      if (j < offers.length) bidLeft = offers[j].kwh;
    }
  }

  if (lastAsk === null || lastBid === null) {
    return { pricePaise: clampToCorridor(BASE_PRICE_PAISE, DEFAULT_TARIFF), volumeKwh: 0 };
  }
  return {
    pricePaise: clampToCorridor(Math.floor((lastAsk + lastBid) / 2), DEFAULT_TARIFF),
    volumeKwh: round(volume, 4),
  };
}

/**
 * Match cleared volume across the network, nearest first.
 *
 * The engine runs min-cost max-flow; this is the greedy fallback with the same
 * cost preference — shortest electrical path wins, because that is the path
 * that loses the least energy.
 */
export function matchSlot(slotIndex: number, orders: SlotOrders): MatchResult {
  const started = performance.now();
  const { pricePaise, volumeKwh } = clearSlot(orders.listings, orders.bids);

  const supplyKwh = orders.listings.reduce((s, l) => s + l.kwh, 0);
  const demandKwh = orders.bids.reduce((s, b) => s + b.kwh, 0);

  const sellers = orders.listings
    .filter((l) => l.askPricePaise <= pricePaise)
    .map((l) => ({ listing: l, left: l.kwh }));
  const buyers = orders.bids
    .filter((b) => b.maxPricePaise >= pricePaise)
    .map((b) => ({ bid: b, left: b.kwh }));

  const pairs: MatchPair[] = [];
  let matched = 0;

  for (const buyer of buyers) {
    // Nearest willing seller first: proximity is the whole efficiency argument.
    const ranked = sellers
      .filter((s) => s.left > 1e-6)
      .map((s) => {
        const path = pathBetween(s.listing.nodeId, buyer.bid.nodeId);
        return { s, path, distanceKm: pathLengthKm(path) };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm || a.s.listing.askPricePaise - b.s.listing.askPricePaise);

    for (const cand of ranked) {
      if (buyer.left <= 1e-6) break;
      const kwh = round(Math.min(cand.s.left, buyer.left), 4);
      if (kwh <= 1e-6) continue;

      const tier = hopTier(cand.s.listing.nodeId, buyer.bid.nodeId);
      const lossPct = transmissionLossPct(tier, cand.distanceKm);
      const deliveredKwh = round(kwh * (1 - lossPct / 100), 4);

      pairs.push({
        listingId: cand.s.listing.id,
        bidId: buyer.bid.id,
        sellerId: cand.s.listing.sellerId,
        buyerId: buyer.bid.buyerId,
        kwh,
        deliveredKwh,
        lossKwh: round(kwh - deliveredKwh, 4),
        distanceKm: round(cand.distanceKm, 4),
        efficiencyPct: round((deliveredKwh / kwh) * 100, 2),
        pathNodeIds: cand.path,
        congestionPenaltyPaise: 0,
      });

      cand.s.left = round(cand.s.left - kwh, 6);
      buyer.left = round(buyer.left - kwh, 6);
      matched += kwh;
    }
  }

  const totalDelivered = pairs.reduce((s, p) => s + p.deliveredKwh, 0);
  const totalLoss = pairs.reduce((s, p) => s + p.lossKwh, 0);
  const unmatchedDemand = round(buyers.reduce((s, b) => s + Math.max(0, b.left), 0), 4);

  return {
    slotId: orders.slotId,
    clearingPricePaise: pricePaise,
    pairs,
    totalMatchedKwh: round(matched, 4),
    totalDeliveredKwh: round(totalDelivered, 4),
    totalLossKwh: round(totalLoss, 4),
    avgEfficiencyPct: pairs.length
      ? round(pairs.reduce((s, p) => s + p.efficiencyPct, 0) / pairs.length, 2)
      : 100,
    unmatchedSupplyKwh: round(Math.max(0, supplyKwh - matched), 4),
    unmatchedDemandKwh: unmatchedDemand,
    gridBackfillKwh: unmatchedDemand,
    computeMs: round(performance.now() - started, 2),
    algorithm: 'greedy-fallback',
  };
}

/* --------------------------------------------------------------- settling */

export interface SettledSlot {
  slotIndex: number;
  slotId: string;
  orders: SlotOrders;
  match: MatchResult;
  trades: TradeRecord[];
  receipts: SettlementReceipt[];
  donations: CommunityDonation[];
  volumeKwh: number;
  clearingPricePaise: number;
}

const BLOCK_ORIGIN = 8_412_770;

export interface DonationConfig {
  /** Percentage of each cleared sale routed to the community pool. */
  donationPct: number;
  /** Only donate once the day's own generation clears this threshold. */
  dailyThresholdKwh: number;
}

export const DEFAULT_DONATION: DonationConfig = { donationPct: 5, dailyThresholdKwh: 8 };

/** Households that had already opted into the pool before the demo started. */
const SEEDED_DONORS: Record<string, number> = {
  'U-02': 4,
  'U-04': 8,
  'U-07': 3,
  'U-08': 6,
  'U-11': 10,
};

export function settleSlot(
  slotIndex: number,
  policy: BrokerPolicy | null,
  donation: DonationConfig,
): SettledSlot {
  const orders = ordersForSlot(slotIndex, policy);
  const match = matchSlot(slotIndex, orders);
  const t = DEFAULT_TARIFF;
  const slotStartMin = slotIndex * SLOT_MINUTES;

  const trades: TradeRecord[] = [];
  const receipts: SettlementReceipt[] = [];
  const donations: CommunityDonation[] = [];

  match.pairs.forEach((p, i) => {
    const gross = Math.round(p.deliveredKwh * match.clearingPricePaise);
    const wheeling = Math.min(Math.round(p.deliveredKwh * t.wheelingChargePaise), gross);
    const id = `TR-${String(slotIndex).padStart(3, '0')}-${String(i + 1).padStart(2, '0')}`;
    const createdAt = simIso(slotStartMin + SLOT_MINUTES, 3 + i * 7);

    // The last slot of the run is still moving through settlement; everything
    // before it has confirmed. One seeded failure exists on purpose so the
    // failed-settlement path is a real screen and not a hypothetical.
    const isFailure = id === 'TR-055-02';
    const status = isFailure ? 'FAILED' : 'SETTLED';

    trades.push({
      id,
      slotId: orders.slotId,
      sellerId: p.sellerId,
      buyerId: p.buyerId,
      kwh: p.kwh,
      deliveredKwh: p.deliveredKwh,
      pricePaise: match.clearingPricePaise,
      grossPaise: gross,
      wheelingFeePaise: wheeling,
      netToSellerPaise: gross - wheeling,
      efficiencyPct: p.efficiencyPct,
      co2AvoidedKg: round(p.deliveredKwh * CO2_AVOIDED_PER_KWH, 4),
      status,
      createdAt,
    });

    receipts.push({
      tradeId: id,
      txHash: hexHash(`tx:${id}`, 64),
      blockNumber: BLOCK_ORIGIN + slotIndex * 12 + i,
      chainId: 31337,
      gasUsed: String(84_000 + Math.floor(seeded(`gas:${id}`) * 26_000)),
      wheelingFeePaise: wheeling,
      merkleRoot: hexHash(`merkle:${orders.slotId}`, 64),
      explorerUrl: null,
      settledAt: simIso(slotStartMin + SLOT_MINUTES, 9 + i * 7),
      mode: 'simulated',
    });

    // Community allocation comes off the seller's cleared volume.
    const pct =
      policy && policy.userId === p.sellerId
        ? policy.communityDonationPct
        : (SEEDED_DONORS[p.sellerId] ?? 0);
    if (pct > 0 && !isFailure) {
      const kwh = round((p.deliveredKwh * pct) / 100, 4);
      if (kwh >= 0.01) {
        const beneficiary = BENEFICIARIES[(slotIndex + i) % BENEFICIARIES.length];
        donations.push({
          id: `DN-${String(slotIndex).padStart(3, '0')}-${i + 1}`,
          donorId: p.sellerId,
          donorName: displayName(p.sellerId),
          beneficiaryId: beneficiary.id,
          beneficiaryName: beneficiary.name,
          kwh,
          slotId: orders.slotId,
          valuePaise: Math.round(kwh * match.clearingPricePaise),
          txHash: hexHash(`dn:${id}`, 64),
          createdAt: simIso(slotStartMin + SLOT_MINUTES, 12 + i * 7),
        });
      }
    }
  });

  return {
    slotIndex,
    slotId: orders.slotId,
    orders,
    match,
    trades,
    receipts,
    donations,
    volumeKwh: match.totalMatchedKwh,
    clearingPricePaise: match.clearingPricePaise,
  };
}

/* -------------------------------------------------------------- history */

const slotCache = new Map<string, SettledSlot>();

export function settledSlot(
  slotIndex: number,
  policy: BrokerPolicy | null,
  donation: DonationConfig,
): SettledSlot {
  const key = `${slotIndex}:${policy?.id ?? '-'}:${donation.donationPct}:${donation.dailyThresholdKwh}`;
  const hit = slotCache.get(key);
  if (hit) return hit;
  const value = settleSlot(slotIndex, policy, donation);
  slotCache.set(key, value);
  if (slotCache.size > 400) slotCache.delete(slotCache.keys().next().value as string);
  return value;
}

export function clearSlotCache(): void {
  slotCache.clear();
}

/** Every slot that has finished clearing at `minutes`, oldest first. */
export function historyUpTo(
  minutes: number,
  policy: BrokerPolicy | null,
  donation: DonationConfig,
): SettledSlot[] {
  const first = slotIndexFor(DAY_START_MIN);
  const last = slotIndexFor(minutes) - 1;
  const out: SettledSlot[] = [];
  for (let i = first; i <= last; i++) out.push(settledSlot(i, policy, donation));
  return out;
}

/* ------------------------------------------------------------ market state */

export function marketStateAt(
  minutes: number,
  topology: GridTopology,
  policy: BrokerPolicy | null,
  donation: DonationConfig,
): MarketState {
  const slotIndex = slotIndexFor(minutes);
  const startMin = slotIndex * SLOT_MINUTES;
  const orders = ordersForSlot(slotIndex, policy);
  const congestion = congestionIndexOf(topology);

  const supply = orders.listings.reduce((s, l) => s + l.kwh, 0);
  const demand = orders.bids.reduce((s, b) => s + b.kwh, 0);
  const previous = slotIndex - 1 >= slotIndexFor(DAY_START_MIN)
    ? settledSlot(slotIndex - 1, policy, donation)
    : null;

  return {
    slotId: orders.slotId,
    slotStartSim: simIso(startMin),
    slotEndSim: simIso(startMin + SLOT_MINUTES),
    totalSupplyKwh: round(supply, 3),
    totalDemandKwh: round(demand, 3),
    indicativePricePaise: indicativePrice(supply, demand, congestion),
    lastClearingPricePaise: previous ? previous.clearingPricePaise : null,
    congestionIndex: round(congestion, 4),
    activeListings: orders.listings.length,
    activeBids: orders.bids.length,
  };
}

export function tickAt(
  minutes: number,
  seq: number,
  speed: number,
  stressedEdges: string[],
  policy: BrokerPolicy | null,
  donation: DonationConfig,
): { tick: Tick; topology: GridTopology; readings: Reading[] } {
  const topology = topologyAt(minutes, stressedEdges);
  const readings = readingsAt(minutes);
  const seconds = Math.round((minutes % 1) * 60);
  return {
    topology,
    readings,
    tick: {
      seq,
      tsSim: simIso(Math.floor(minutes), seconds),
      tsReal: new Date().toISOString(),
      speed,
      weather: weatherAt(minutes),
      meters: readings.map(({ name, shortName, panelKw, role, ...m }) => m),
      market: marketStateAt(minutes, topology, policy, donation),
    },
  };
}

/* ------------------------------------------------------------ day series */

export interface DayPoint {
  minute: number;
  clock: string;
  generationKw: number;
  consumptionKw: number;
  surplusKw: number;
  cloudCoverPct: number;
}

/**
 * Solar-day curve for one meter, or the whole neighbourhood when null.
 *
 * The whole curve is deterministic, so it is computed once and cached for the
 * session — only the "you are here" marker moves as the clock advances, and
 * that is the chart's job, not this function's.
 */
const dayCache = new Map<string, DayPoint[]>();

export function daySeries(userId: string | null, stepMin = 10): DayPoint[] {
  const key = `${userId ?? 'ALL'}:${stepMin}`;
  const hit = dayCache.get(key);
  if (hit) return hit;

  const out: DayPoint[] = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += stepMin) {
    const readings = readingsAt(m);
    const scoped = userId ? readings.filter((r) => r.userId === userId) : readings;
    const generation = scoped.reduce((s, r) => s + r.generationKw, 0);
    const consumption = scoped.reduce((s, r) => s + r.consumptionKw, 0);
    out.push({
      minute: m,
      clock: simIso(m).slice(11, 16),
      generationKw: round(generation, 3),
      consumptionKw: round(consumption, 3),
      surplusKw: round(generation - consumption, 3),
      cloudCoverPct: weatherAt(m).cloudCoverPct,
    });
  }
  dayCache.set(key, out);
  return out;
}

export interface PricePoint {
  slotIndex: number;
  slotId: string;
  clock: string;
  clearingPricePaise: number;
  volumeKwh: number;
}

export function priceSeries(history: SettledSlot[]): PricePoint[] {
  return history.map((s) => ({
    slotIndex: s.slotIndex,
    slotId: s.slotId,
    clock: s.slotId.slice(11, 16),
    clearingPricePaise: s.clearingPricePaise,
    volumeKwh: s.volumeKwh,
  }));
}

/* ---------------------------------------------------------------- helpers */

export function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** Deterministic hex, so the same trade always shows the same hash. */
export function hexHash(key: string, length: number): string {
  let out = '';
  let i = 0;
  while (out.length < length) {
    out += Math.floor(seeded(`${key}:${i++}`) * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  }
  return `0x${out.slice(0, length)}`;
}
