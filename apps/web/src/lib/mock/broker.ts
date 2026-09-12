/**
 * Broker policy parsing and decision loop (mock path).
 *
 * The division of labour is the important part and it is visible in the types:
 * language in, a *constrained policy* out — objective, price floor, urgency,
 * reserve, donation share, validity window. Nothing else. The executor below
 * is ordinary deterministic code that reads that policy and the market, and it
 * is the only thing that ever produces an order.
 *
 * With mocks off, POST /broker/policy does the parsing with an LLM and returns
 * the same shape, schema-validated and corridor-clamped. The rule-based parser
 * here is the same fallback the engine uses when the model is unavailable, so
 * it is labelled `source: 'fallback'` and the UI says so.
 */
import {
  DEFAULT_TARIFF,
  type BrokerDecision,
  type BrokerObjective,
  type BrokerPolicy,
  type Listing,
  type MarketState,
} from '@sunshare/shared';
import { clampToCorridor } from '@/lib/domain';
import { minutesToSunset } from '@/lib/solar';
import { rupees } from '@/lib/format';
import { DAY_END_MIN, SIM_DAY_OF_YEAR, simIso, weatherAt } from './market-engine';

export const GOAL_EXAMPLES = [
  'Sell fast before sunset, but never below ₹4.50.',
  'Get the best price today, I can wait until 8pm.',
  'Keep 2 kWh for the evening, sell the rest and donate 10% to the school.',
  'Only sell if it beats what the grid pays me, otherwise hold.',
];

const OBJECTIVE_COPY: Record<BrokerObjective, string> = {
  MAX_PROFIT: 'Maximise price',
  SELL_FAST: 'Sell quickly',
  BEAT_GRID: 'Beat the feed-in tariff',
  MAX_COMMUNITY: 'Maximise community allocation',
};

export function objectiveLabel(o: BrokerObjective): string {
  return OBJECTIVE_COPY[o];
}

/* --------------------------------------------------------------- parsing */

function parseMoneyPaise(text: string): number | null {
  const m = text.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d{1,2})?)|(\d+\.\d{1,2})\s*(?:rupees|rs)?/i);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  if (!raw) return null;
  return Math.round(parseFloat(raw) * 100);
}

function parseKwh(text: string, near: RegExp): number | null {
  const m = text.match(near);
  return m ? parseFloat(m[1]) : null;
}

function parsePct(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%/);
  return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;
}

function parseUntilMinutes(text: string, nowMin: number): number {
  const clock = text.match(/(?:until|till|by|before)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock) {
    let h = parseInt(clock[1], 10);
    const mm = clock[2] ? parseInt(clock[2], 10) : 0;
    const mer = clock[3]?.toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    if (!mer && h <= 11 && h >= 1) h += 12; // "by 8" in an energy app means 20:00
    return Math.min(DAY_END_MIN, h * 60 + mm);
  }
  if (/sunset|dark|evening/i.test(text)) {
    return Math.min(DAY_END_MIN, Math.round(nowMin + minutesToSunset(nowMin / 60, SIM_DAY_OF_YEAR)));
  }
  return Math.min(DAY_END_MIN, nowMin + 180);
}

export function parseGoal(userId: string, goal: string, nowMin: number): BrokerPolicy {
  const text = goal.trim();
  const lower = text.toLowerCase();

  let objective: BrokerObjective = 'MAX_PROFIT';
  if (/\b(fast|quick|asap|urgent|dump|clear it|get rid)\b/.test(lower)) objective = 'SELL_FAST';
  if (/\b(community|donate|donation|school|neighbour(hood)? pool|charity)\b/.test(lower))
    objective = 'MAX_COMMUNITY';
  if (/\b(beat|better than|more than)\b.*\b(grid|feed[- ]?in|discom|export)\b/.test(lower))
    objective = 'BEAT_GRID';
  if (/\b(best price|highest|maximise|maximize|most money|wait)\b/.test(lower) && objective === 'MAX_PROFIT')
    objective = 'MAX_PROFIT';

  const explicitMin = parseMoneyPaise(text);
  const defaultMin =
    objective === 'BEAT_GRID'
      ? DEFAULT_TARIFF.feedInTariffPaise + DEFAULT_TARIFF.wheelingChargePaise + 25
      : objective === 'SELL_FAST'
        ? DEFAULT_TARIFF.feedInTariffPaise + 90
        : Math.round((DEFAULT_TARIFF.feedInTariffPaise + DEFAULT_TARIFF.retailTariffPaise) / 2);

  const minPricePaise = clampToCorridor(explicitMin ?? defaultMin, DEFAULT_TARIFF);

  const urgency =
    objective === 'SELL_FAST' ? 0.85 : objective === 'MAX_PROFIT' ? 0.2 : 0.5;

  const reserveKwh =
    parseKwh(lower, /(?:keep|reserve|hold back|save)\s*(\d+(?:\.\d+)?)\s*kwh/) ??
    (/\b(keep|reserve|evening|night)\b/.test(lower) ? 2 : 1);

  const donationPct =
    parsePct(lower) ?? (objective === 'MAX_COMMUNITY' ? 10 : 0);

  const validUntilMin = parseUntilMinutes(lower, nowMin);

  return {
    id: `BP-${Math.round(nowMin)}-${userId}`,
    userId,
    rawGoal: text,
    objective,
    minPricePaise,
    maxPricePaise: DEFAULT_TARIFF.retailTariffPaise,
    urgency: /\bbefore sunset\b/.test(lower) ? Math.min(1, urgency + 0.1) : urgency,
    reserveKwh,
    communityDonationPct: donationPct,
    validUntilSim: simIso(validUntilMin),
    rationale: buildRationale(objective, minPricePaise, reserveKwh, donationPct, validUntilMin),
    source: 'fallback',
    createdAt: simIso(Math.floor(nowMin), Math.round((nowMin % 1) * 60)),
  };
}

function buildRationale(
  objective: BrokerObjective,
  minPricePaise: number,
  reserveKwh: number,
  donationPct: number,
  validUntilMin: number,
): string {
  const parts = [
    `Read as "${OBJECTIVE_COPY[objective].toLowerCase()}"`,
    `floor at ${rupees(minPricePaise)}/kWh`,
    `${reserveKwh} kWh held for the household`,
  ];
  if (donationPct > 0) parts.push(`${donationPct}% routed to the community pool`);
  parts.push(`expires ${simIso(validUntilMin).slice(11, 16)}`);
  return `${parts.join(', ')}. The floor is clamped into the price corridor before any order is placed.`;
}

/* -------------------------------------------------------------- executor */

export interface BrokerContext {
  nowMin: number;
  /** Positive surplus still expected today. What the reserve is measured against. */
  surplusKwh: number;
  /** What the meter can actually deliver inside the current slot. */
  offerableKwh: number;
  dayGenerationKwh: number;
  market: MarketState;
  congestionIndex: number;
  listing: Listing | null;
}

/**
 * One evaluation of the policy against the market.
 *
 * Returns null when nothing has changed since the last decision — an activity
 * feed that logs "still holding" every five minutes is noise, not an audit
 * trail.
 */
export function evaluate(
  policy: BrokerPolicy,
  ctx: BrokerContext,
  previous: BrokerDecision | null,
): BrokerDecision | null {
  const marketPrice = ctx.market.lastClearingPricePaise ?? ctx.market.indicativePricePaise;
  const validUntilMin = clockToMinutes(policy.validUntilSim);
  const toSunset = minutesToSunset(ctx.nowMin / 60, SIM_DAY_OF_YEAR);
  const cloud = weatherAt(ctx.nowMin + 30).cloudCoverPct;

  const inputs = {
    surplusKwh: round2(ctx.surplusKwh),
    minutesToSunset: Math.round(toSunset),
    forecastCloudPct: cloud,
    marketPricePaise: marketPrice,
    congestionIndex: round2(ctx.congestionIndex),
  };

  const base = {
    id: `BD-${Math.round(ctx.nowMin * 60)}`,
    policyId: policy.id,
    slotId: ctx.market.slotId,
    tsSim: simIso(Math.floor(ctx.nowMin), Math.round((ctx.nowMin % 1) * 60)),
    inputs,
  };

  const emit = (
    action: BrokerDecision['action'],
    kwh: number,
    toPrice: number | null,
    reason: string,
  ): BrokerDecision | null => {
    const decision: BrokerDecision = {
      ...base,
      action,
      kwh: round2(kwh),
      fromPricePaise: ctx.listing?.askPricePaise ?? null,
      toPricePaise: toPrice,
      reason,
    };
    // Suppress consecutive identical holds.
    if (
      previous &&
      previous.action === decision.action &&
      previous.reason === decision.reason
    ) {
      return null;
    }
    return decision;
  };

  if (ctx.nowMin >= validUntilMin) {
    if (previous?.action === 'WITHDRAW') return null;
    return emit(
      'WITHDRAW',
      ctx.listing?.kwh ?? 0,
      null,
      `Validity window closed at ${policy.validUntilSim.slice(11, 16)}. Any unsold listing is withdrawn and the surplus reverts to the feed-in tariff.`,
    );
  }

  const headroom = ctx.surplusKwh - policy.reserveKwh;
  if (headroom <= 0.05) {
    return emit(
      'HOLD',
      0,
      null,
      `Expected surplus for the rest of the day is ${round2(ctx.surplusKwh)} kWh, inside the ${policy.reserveKwh} kWh reserve you set for the household.`,
    );
  }

  // Only one slot's production can be delivered in one slot, however much
  // headroom the day has.
  const sellable = Math.min(headroom, ctx.offerableKwh);
  if (sellable <= 0.05) {
    return emit(
      'HOLD',
      0,
      null,
      `Generation is ${round2(ctx.offerableKwh)} kWh for this slot — too little to offer, though ${round2(headroom)} kWh remains available later today.`,
    );
  }

  if (marketPrice < policy.minPricePaise) {
    const patience = validUntilMin - ctx.nowMin;
    return emit(
      'HOLD',
      0,
      null,
      `Current clearing price ${rupees(marketPrice)} is below the configured minimum ${rupees(policy.minPricePaise)}. ${Math.round(patience)} minutes of validity remain.`,
    );
  }

  // Price is acceptable. Place, reprice, or leave the live listing alone.
  const target = clampToCorridor(
    Math.max(policy.minPricePaise, Math.round(marketPrice * (1 + 0.04 * (1 - policy.urgency)))),
    DEFAULT_TARIFF,
  );

  if (!ctx.listing) {
    const urgencyNote =
      toSunset < 60
        ? `Generation ends in ${Math.round(toSunset)} minutes`
        : `Validity window closes at ${policy.validUntilSim.slice(11, 16)}`;
    return emit(
      'LIST',
      sellable,
      target,
      `Market price ${rupees(marketPrice)} crossed the configured minimum ${rupees(policy.minPricePaise)}. ${urgencyNote}, so ${round2(sellable)} kWh is offered at ${rupees(target)}.`,
    );
  }

  const drift = Math.abs(target - ctx.listing.askPricePaise);
  if (drift >= 15) {
    return emit(
      'REPRICE',
      ctx.listing.kwh,
      target,
      `Clearing price moved to ${rupees(marketPrice)}. Ask repriced from ${rupees(ctx.listing.askPricePaise)} to ${rupees(target)} to stay inside the matching band.`,
    );
  }

  return emit(
    'HOLD',
    ctx.listing.kwh,
    ctx.listing.askPricePaise,
    `Listing is live at ${rupees(ctx.listing.askPricePaise)} and the market has not moved enough to justify repricing.`,
  );
}

function clockToMinutes(iso: string): number {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
