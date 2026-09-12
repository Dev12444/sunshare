/**
 * Domain helpers shared across surfaces.
 *
 * These mirror rules that also live in services/engine and in the contracts —
 * the price corridor in particular is enforced in three places on purpose. The
 * copies here exist so the UI can *explain* a number, not so it can invent one:
 * anything the server sends wins.
 */
import {
  CONGESTION_CRITICAL_THRESHOLD,
  CONGESTION_HIGH_THRESHOLD,
  CO2_AVOIDED_PER_KWH,
  KG_CO2_PER_TREE_YEAR,
  LOSS_CROSS_SUBSTATION_PCT,
  LOSS_PER_KM_PCT,
  LOSS_SAME_FEEDER_PCT,
  LOSS_SAME_SUBSTATION_PCT,
  TD_LOSS_FRACTION,
  type CongestionLevel,
  type GridEdge,
  type GridNode,
  type TariffContext,
  type TradeStatus,
  type OrderStatus,
} from '@sunshare/shared';

/* --------------------------------------------------------- price corridor */

export function clampToCorridor(paise: number, t: TariffContext): number {
  return Math.max(t.feedInTariffPaise, Math.min(Math.round(paise), t.retailTariffPaise));
}

/** Where a price sits in the corridor, 0 (floor) .. 1 (ceiling). */
export function corridorPosition(paise: number, t: TariffContext): number {
  const width = t.retailTariffPaise - t.feedInTariffPaise;
  if (width <= 0) return 0;
  return Math.max(0, Math.min(1, (paise - t.feedInTariffPaise) / width));
}

export type CorridorVerdict = 'BELOW_FLOOR' | 'IN_CORRIDOR' | 'ABOVE_CEILING';

export function corridorVerdict(paise: number, t: TariffContext): CorridorVerdict {
  if (paise < t.feedInTariffPaise) return 'BELOW_FLOOR';
  if (paise > t.retailTariffPaise) return 'ABOVE_CEILING';
  return 'IN_CORRIDOR';
}

/** What the seller keeps after the DISCOM's wheeling charge. */
export function netToSeller(paise: number, t: TariffContext): number {
  return Math.max(0, paise - t.wheelingChargePaise);
}

/** What the buyer avoids paying versus importing at the retail tariff. */
export function buyerSaving(paise: number, t: TariffContext): number {
  return Math.max(0, t.retailTariffPaise - paise);
}

/** What the seller gains versus exporting at the feed-in tariff. */
export function sellerGain(paise: number, t: TariffContext): number {
  return Math.max(0, netToSeller(paise, t) - t.feedInTariffPaise);
}

/* ---------------------------------------------------------------- losses */

export type HopTier = 'SAME_FEEDER' | 'SAME_SUBSTATION' | 'CROSS_SUBSTATION';

export function hopTierLossPct(tier: HopTier): number {
  switch (tier) {
    case 'SAME_FEEDER':
      return LOSS_SAME_FEEDER_PCT;
    case 'SAME_SUBSTATION':
      return LOSS_SAME_SUBSTATION_PCT;
    default:
      return LOSS_CROSS_SUBSTATION_PCT;
  }
}

export function transmissionLossPct(tier: HopTier, distanceKm: number): number {
  return hopTierLossPct(tier) + LOSS_PER_KM_PCT * distanceKm;
}

/* ------------------------------------------------------------ congestion */

export function utilisation(edge: Pick<GridEdge, 'currentLoadKw' | 'capacityKw'>): number {
  if (edge.capacityKw <= 0) return 0;
  return Math.max(0, edge.currentLoadKw / edge.capacityKw);
}

export function congestionLevel(u: number): CongestionLevel {
  if (u >= CONGESTION_CRITICAL_THRESHOLD) return 'CRITICAL';
  if (u >= CONGESTION_HIGH_THRESHOLD) return 'HIGH';
  return 'NORMAL';
}

export function nodeUtilisation(node: Pick<GridNode, 'loadKw' | 'capacityKw'>): number {
  if (node.capacityKw <= 0) return 0;
  return Math.max(0, Math.abs(node.loadKw) / node.capacityKw);
}

/* ---------------------------------------------------------------- carbon */

export function co2AvoidedKg(localKwh: number): number {
  return localKwh * CO2_AVOIDED_PER_KWH;
}

export function treeEquivalent(co2Kg: number): number {
  return co2Kg / KG_CO2_PER_TREE_YEAR;
}

/** kWh of generation the grid did not have to push through lossy T&D lines. */
export function gridEnergyDisplaced(localKwh: number): number {
  return localKwh * (1 + TD_LOSS_FRACTION);
}

/* ------------------------------------------------------------- vocabulary */

export const TRADE_STATUS_COPY: Record<TradeStatus, string> = {
  MATCHED: 'Matched',
  COMMITTED: 'Committed',
  DELIVERING: 'Delivering',
  SETTLED: 'Settled',
  FAILED: 'Failed',
};

export const ORDER_STATUS_COPY: Record<OrderStatus, string> = {
  OPEN: 'Open',
  MATCHED: 'Matched',
  PARTIAL: 'Partial',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
};

export type Tone = 'neutral' | 'up' | 'down' | 'warn' | 'solar' | 'mains';

export function tradeStatusTone(s: TradeStatus): Tone {
  if (s === 'SETTLED') return 'up';
  if (s === 'FAILED') return 'down';
  if (s === 'DELIVERING') return 'solar';
  return 'neutral';
}

export function orderStatusTone(s: OrderStatus): Tone {
  if (s === 'MATCHED') return 'up';
  if (s === 'PARTIAL') return 'warn';
  if (s === 'EXPIRED' || s === 'WITHDRAWN') return 'neutral';
  return 'solar';
}

export function congestionTone(l: CongestionLevel): Tone {
  return l === 'CRITICAL' ? 'down' : l === 'HIGH' ? 'warn' : 'up';
}
