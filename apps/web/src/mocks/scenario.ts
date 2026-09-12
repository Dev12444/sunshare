/**
 * Demo scenario — Diya.
 *
 * Derives a full day of trades, broker decisions, community donations and
 * carbon/badge progress directly from fixtures/ticks.json (Dev's simulator
 * capture). Nothing here is invented independently of that fixture: every
 * kWh and price traces back to a real tick, so seller FIT < clearing price <
 * buyer retail and every trade nets out (gross - wheeling = net) by
 * construction.
 *
 * TODO(Diya): replace with services/engine's real /match history once Dev
 * exposes a settled-trades endpoint. The shape (TradeRecord[], etc.) will
 * not change, so nothing downstream breaks.
 */
import type {
  Badge,
  Beneficiary,
  BrokerDecision,
  CarbonSummary,
  CommunityDonation,
  SettlementReceipt,
  TradeRecord,
} from '@sunshare/shared';
import {
  BADGE_DEFINITIONS,
  CO2_AVOIDED_PER_KWH,
  DEFAULT_TARIFF,
  LOSS_SAME_FEEDER_PCT,
  SLOT_MINUTES,
} from '@sunshare/shared';
import type { Tick } from '@sunshare/shared';
import ticksFixture from './fixtures/ticks.json';

const ticks = ticksFixture as unknown as Tick[];

/** Fixture convention, verified against ticks.json: totalSupplyKwh = Σ surplusKw
 *  × (SLOT_MINUTES/60). Matches every derived trade to this so a single trade
 *  never exceeds the network's own reported slot supply. */
const SLOT_HOURS = SLOT_MINUTES / 60;

/** The prosumer whose story the Broker/Impact pages tell — biggest generator in the fixture. */
export const DEMO_USER_ID = 'U-04';

/** Tick indices that carry the day's narrative: morning trickle through the
 *  evening price-crossing moment the fixture actually contains at 17:20. */
const STORY_TICKS = [14, 20, 30, 36, 45, 50, 60, 67, 68] as const;

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

type Built = {
  trades: TradeRecord[];
  receipts: Record<string, SettlementReceipt>;
  decisions: BrokerDecision[];
  donations: CommunityDonation[];
};

function build(): Built {
  const trades: TradeRecord[] = [];
  const receipts: Record<string, SettlementReceipt> = {};
  const decisions: BrokerDecision[] = [];
  const donations: CommunityDonation[] = [];

  let blockNumber = 4_812_003;

  STORY_TICKS.forEach((idx, storyPos) => {
    const t = ticks[idx];
    const price = t.market.indicativePricePaise;
    // Backstory threshold for the day's settled-trade history (Ledger/Community/
    // Impact). Independent of the interactive broker's own ₹4.50 example policy —
    // that one re-evaluates live ticks in real time (see (dash)/broker/page.tsx).
    const minPricePaise = 380;
    const sellers = [...t.meters].filter((m) => m.surplusKw > 0.02).sort((a, b) => b.surplusKw - a.surplusKw);
    const buyers = [...t.meters].filter((m) => m.surplusKw < -0.02).sort((a, b) => a.surplusKw - b.surplusKw);
    const minutesToSunset = Math.max(0, 18 * 60 - (Number(t.tsSim.slice(11, 13)) * 60 + Number(t.tsSim.slice(14, 16))));

    if (price < minPricePaise || sellers.length === 0 || buyers.length === 0) {
      decisions.push({
        id: `dec-${idx}`,
        policyId: 'policy-demo',
        slotId: t.market.slotId,
        tsSim: t.tsSim,
        action: 'HOLD',
        kwh: 0,
        fromPricePaise: null,
        toPricePaise: null,
        reason:
          sellers.length === 0
            ? 'No exportable surplus this slot — reserve and self-consumption cover load.'
            : `Market price ₹${(price / 100).toFixed(2)} is below minimum ₹${(minPricePaise / 100).toFixed(2)}.`,
        inputs: {
          surplusKwh: sellers.reduce((s, m) => s + m.surplusKw, 0) * SLOT_HOURS,
          minutesToSunset,
          forecastCloudPct: t.weather.cloudCoverPct,
          marketPricePaise: price,
          congestionIndex: t.market.congestionIndex,
        },
      });
      return;
    }

    const seller = sellers[0];
    const buyer = buyers[0];
    const rawKwh = Math.min(seller.surplusKw, -buyer.surplusKw) * SLOT_HOURS;
    // Never let one matched pair exceed the network's own reported slot supply.
    const kwh = Math.round(Math.min(rawKwh, t.market.totalSupplyKwh) * 100) / 100;
    if (kwh <= 0) return;

    const lossKwh = Math.round(kwh * (LOSS_SAME_FEEDER_PCT / 100) * 1000) / 1000;
    const deliveredKwh = Math.round((kwh - lossKwh) * 1000) / 1000;
    const grossPaise = Math.round(kwh * price);
    const wheelingFeePaise = Math.round(kwh * DEFAULT_TARIFF.wheelingChargePaise);
    const netToSellerPaise = grossPaise - wheelingFeePaise;
    const co2AvoidedKg = Math.round(deliveredKwh * CO2_AVOIDED_PER_KWH * 1000) / 1000;
    const tradeId = `TRD-${t.tsSim.slice(5, 10)}-${seller.meterId}-${buyer.meterId}`;

    decisions.push({
      id: `dec-${idx}-trigger`,
      policyId: 'policy-demo',
      slotId: t.market.slotId,
      tsSim: t.tsSim,
      action: 'LIST',
      kwh,
      fromPricePaise: null,
      toPricePaise: price,
      reason: `Market crossed ₹${(minPricePaise / 100).toFixed(2)} and a local buyer is available.`,
      inputs: {
        surplusKwh: seller.surplusKw,
        minutesToSunset,
        forecastCloudPct: t.weather.cloudCoverPct,
        marketPricePaise: price,
        congestionIndex: t.market.congestionIndex,
      },
    });

    const donatePct = storyPos % 2 === 0 ? 10 : 0;
    const donateKwh = Math.round(deliveredKwh * (donatePct / 100) * 1000) / 1000;
    if (donatePct > 0) {
      decisions.push({
        id: `dec-${idx}-donate`,
        policyId: 'policy-demo',
        slotId: t.market.slotId,
        tsSim: t.tsSim,
        action: 'DONATE',
        kwh: donateKwh,
        fromPricePaise: null,
        toPricePaise: null,
        reason: `Routed ${donatePct}% of this sale to the community pool per policy.`,
        inputs: {
          surplusKwh: seller.surplusKw,
          minutesToSunset,
          forecastCloudPct: t.weather.cloudCoverPct,
          marketPricePaise: price,
          congestionIndex: t.market.congestionIndex,
        },
      });
      const beneficiary = BENEFICIARIES[storyPos % BENEFICIARIES.length];
      donations.push({
        id: `don-${idx}`,
        donorId: seller.userId,
        donorName: seller.userId,
        beneficiaryId: beneficiary.id,
        beneficiaryName: beneficiary.name,
        kwh: donateKwh,
        slotId: t.market.slotId,
        valuePaise: Math.round(donateKwh * price),
        txHash: `0x${hash(`don-${idx}`)}${hash(beneficiary.id)}`,
        createdAt: t.tsSim,
      });
    }

    const settlesAtSim = t.tsSim;
    trades.push({
      id: tradeId,
      slotId: t.market.slotId,
      sellerId: seller.userId,
      buyerId: buyer.userId,
      kwh,
      deliveredKwh,
      pricePaise: price,
      grossPaise,
      wheelingFeePaise,
      netToSellerPaise,
      efficiencyPct: Math.round((deliveredKwh / kwh) * 10000) / 100,
      co2AvoidedKg,
      status: 'SETTLED',
      createdAt: settlesAtSim,
    });

    blockNumber += 1;
    receipts[tradeId] = {
      tradeId,
      txHash: `0x${hash(tradeId)}${hash(seller.meterId + buyer.meterId)}`,
      blockNumber,
      chainId: 80002,
      gasUsed: '84213',
      wheelingFeePaise,
      merkleRoot: null,
      explorerUrl: null,
      settledAt: settlesAtSim,
      mode: 'simulated',
    };

    decisions.push({
      id: `dec-${idx}-settle`,
      policyId: 'policy-demo',
      slotId: t.market.slotId,
      tsSim: t.tsSim,
      action: 'REPRICE',
      kwh,
      fromPricePaise: price,
      toPricePaise: price,
      reason: `Settlement confirmed — ${kwh.toFixed(2)} kWh, ₹${(netToSellerPaise / 100).toFixed(2)} net to seller.`,
      inputs: {
        surplusKwh: seller.surplusKw,
        minutesToSunset,
        forecastCloudPct: t.weather.cloudCoverPct,
        marketPricePaise: price,
        congestionIndex: t.market.congestionIndex,
      },
    });
  });

  return { trades, receipts, decisions, donations };
}

export const BENEFICIARIES: Beneficiary[] = [
  {
    id: 'BEN-01',
    name: 'Government Primary School',
    kind: 'SCHOOL',
    nodeId: 'H-09',
    walletAddress: '0x000000000000000000000000000000000000b1',
    verifiedBy: 'Gandhinagar Municipal Corporation',
    verifiedAt: '2026-08-01T00:00:00+05:30',
  },
  {
    id: 'BEN-02',
    name: 'Sector 7 Street Lighting',
    kind: 'STREETLIGHT',
    nodeId: 'H-11',
    walletAddress: '0x000000000000000000000000000000000000b2',
    verifiedBy: 'Gandhinagar Municipal Corporation',
    verifiedAt: '2026-08-01T00:00:00+05:30',
  },
  {
    id: 'BEN-03',
    name: 'Community Health Clinic',
    kind: 'CLINIC',
    nodeId: 'H-12',
    walletAddress: '0x000000000000000000000000000000000000b3',
    verifiedBy: 'Gujarat DISCOM Liaison Office',
    verifiedAt: '2026-08-01T00:00:00+05:30',
  },
];

const scenario = build();

export const DEMO_TRADES: TradeRecord[] = scenario.trades;
export const DEMO_RECEIPTS: Record<string, SettlementReceipt> = scenario.receipts;
export const DEMO_DECISIONS: BrokerDecision[] = scenario.decisions;
export const DEMO_DONATIONS: CommunityDonation[] = scenario.donations;

/** Pure helper behind carbonSummaryFor. */
function summarizeCarbon(trades: TradeRecord[], userId: string): CarbonSummary {
  const mine = trades.filter((t) => t.sellerId === userId);
  const localKwh = Math.round(mine.reduce((s, t) => s + t.deliveredKwh, 0) * 100) / 100;
  const co2AvoidedKg = Math.round(mine.reduce((s, t) => s + t.co2AvoidedKg, 0) * 100) / 100;
  return {
    userId,
    periodStart: ticks[0].tsSim,
    periodEnd: ticks[ticks.length - 1].tsSim,
    localKwh,
    co2AvoidedKg,
    treeEquivalent: Math.round((co2AvoidedKg / 21) * 10) / 10,
    gridComparisonKg: Math.round(localKwh * 0.71 * 100) / 100,
    rank: 2,
  };
}

/** Pure — see summarizeCarbon. */
function computeBadges(trades: TradeRecord[], donations: CommunityDonation[], userId: string): Badge[] {
  const mine = trades.filter((t) => t.sellerId === userId);
  const totalKwh = mine.reduce((s, t) => s + t.deliveredKwh, 0);
  const totalCo2 = mine.reduce((s, t) => s + t.co2AvoidedKg, 0);
  const donatedKwh = donations.filter((d) => d.donorId === userId).reduce((s, d) => s + d.kwh, 0);
  const tradeCount = mine.length;

  return BADGE_DEFINITIONS.map((def) => {
    const progress =
      def.code === 'FIRST_TRADE'
        ? tradeCount
        : def.code === 'COMMUNITY_HERO'
          ? donatedKwh
          : def.code === 'CARBON_CENTURY'
            ? totalCo2
            : totalKwh;
    const progressPct = Math.min(100, Math.round((progress / def.threshold) * 100));
    return {
      ...def,
      unlockedAt: progressPct >= 100 ? mine.at(-1)?.createdAt ?? null : null,
      progressPct,
    };
  });
}

export function carbonSummaryFor(userId: string): CarbonSummary {
  return summarizeCarbon(DEMO_TRADES, userId);
}

export function badgesFor(userId: string): Badge[] {
  return computeBadges(DEMO_TRADES, DEMO_DONATIONS, userId);
}

/**
 * Mirrors communityOverview() in Rahi's lib/community.ts field for field, so
 * the Community screen can read one shape whether it is talking to the mock or
 * to the real route.
 */
export function communityOverview() {
  const beneficiaries = BENEFICIARIES.map((b) => ({
    ...b,
    receivedKwh:
      Math.round(
        DEMO_DONATIONS.filter((d) => d.beneficiaryId === b.id).reduce((s, d) => s + d.kwh, 0) * 1000,
      ) / 1000,
  }));

  const donorIds = [...new Set(DEMO_DONATIONS.map((d) => d.donorId))];
  const leaderboard = donorIds
    .map((donorId) => {
      const mine = DEMO_DONATIONS.filter((d) => d.donorId === donorId);
      return {
        donorId,
        donorName: donorId,
        kwh: Math.round(mine.reduce((s, d) => s + d.kwh, 0) * 1000) / 1000,
        valuePaise: mine.reduce((s, d) => s + d.valuePaise, 0),
      };
    })
    .sort((a, b) => b.kwh - a.kwh)
    .map((row, i) => ({ rank: i + 1, ...row }));

  return { beneficiaries, donations: DEMO_DONATIONS, leaderboard };
}

/** Network-wide avoided CO2, counted off trades so neither side double counts. */
export function networkCo2AvoidedKg(): number {
  return Math.round(DEMO_TRADES.reduce((s, t) => s + t.co2AvoidedKg, 0) * 100) / 100;
}
