/**
 * Broker rules, client side — Diya.
 *
 * Distinct from lib/broker.ts (Rahi), which is the platform-side broker: that
 * one calls the engine, persists the policy through Prisma and publishes to
 * the event bus. This file is browser-only and has no server dependencies.
 *
 * Two jobs:
 *  - parseGoal turns a free-text goal ("Sell before sunset, but never below
 *    ₹4.50") into a corridor-clamped BrokerPolicy. It is the mock-mode stand-in
 *    for the engine's LLM-backed POST /broker/policy, and the "rule-based
 *    fallback still works" promise from .env.example.
 *  - decide reads live market state and returns HOLD/SELL with a reason, so the
 *    Broker screen can show the deterministic call against the current tick
 *    without waiting on a round trip.
 *
 * Neither function moves energy or money — see BrokerPolicy in @sunshare/shared.
 */
import type { BrokerObjective, BrokerPolicy } from '@sunshare/shared';
import { DEFAULT_TARIFF } from '@sunshare/shared';

const { feedInTariffPaise, retailTariffPaise } = DEFAULT_TARIFF;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function extractRupees(goal: string): number | null {
  const m = goal.match(/₹\s*(\d+(?:\.\d+)?)|(?:rs\.?|inr)\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

export function parseGoal(userId: string, goal: string): BrokerPolicy {
  const lower = goal.toLowerCase();
  const rupees = extractRupees(goal);

  let objective: BrokerObjective = 'MAX_PROFIT';
  if (/fast|now|quick|dump/.test(lower)) objective = 'SELL_FAST';
  else if (/grid|discom|beat/.test(lower)) objective = 'BEAT_GRID';
  else if (/communit|donat|school|charity/.test(lower)) objective = 'MAX_COMMUNITY';

  const minPricePaise = rupees
    ? clamp(Math.round(rupees * 100), feedInTariffPaise, retailTariffPaise)
    : feedInTariffPaise + Math.round((retailTariffPaise - feedInTariffPaise) * 0.4);

  const urgency = /sunset|before evening|today|urgent|now/.test(lower)
    ? 0.8
    : /patient|best price|wait/.test(lower)
      ? 0.2
      : 0.5;

  const reserveMatch = lower.match(/keep\s+(\d+(?:\.\d+)?)\s*kwh/);
  const reserveKwh = reserveMatch ? Number(reserveMatch[1]) : 1;

  const donationMatch = lower.match(/(\d+)\s*%\s*(?:to|for)?\s*communit/);
  const communityDonationPct = donationMatch
    ? clamp(Number(donationMatch[1]), 0, 100)
    : /communit|donat/.test(lower)
      ? 10
      : 0;

  const validUntilSim = /sunset/.test(lower)
    ? new Date(new Date().setHours(18, 0, 0, 0)).toISOString()
    : new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  return {
    id: `policy-${Date.now().toString(36)}`,
    userId,
    rawGoal: goal,
    objective,
    minPricePaise,
    maxPricePaise: retailTariffPaise,
    urgency,
    reserveKwh,
    communityDonationPct,
    validUntilSim,
    rationale: describePolicy({
      objective,
      minPricePaise,
      urgency,
      reserveKwh,
      communityDonationPct,
    }),
    source: 'fallback',
    createdAt: new Date().toISOString(),
  };
}

function describePolicy(p: {
  objective: BrokerObjective;
  minPricePaise: number;
  urgency: number;
  reserveKwh: number;
  communityDonationPct: number;
}): string {
  const parts = [
    `Hold for at least ₹${(p.minPricePaise / 100).toFixed(2)}/kWh`,
    p.reserveKwh > 0 ? `keep ${p.reserveKwh} kWh in reserve` : null,
    p.communityDonationPct > 0 ? `route ${p.communityDonationPct}% to the community pool` : null,
    p.urgency > 0.6 ? 'sell promptly once the floor is met' : 'wait for the best clearing price',
  ].filter(Boolean);
  return `${parts.join(', ')}.`;
}

export type BrokerDecisionResult = {
  action: 'HOLD' | 'SELL';
  reason: string;
};

/** Deterministic executor — the only thing that can trigger a listing. */
export function decide(
  policy: Pick<BrokerPolicy, 'minPricePaise'>,
  marketPricePaise: number,
  availableSurplusKwh: number,
): BrokerDecisionResult {
  const min = (policy.minPricePaise / 100).toFixed(2);
  const price = (marketPricePaise / 100).toFixed(2);

  if (availableSurplusKwh <= 0) {
    return { action: 'HOLD', reason: 'No exportable surplus this slot.' };
  }
  if (marketPricePaise < policy.minPricePaise) {
    return { action: 'HOLD', reason: `Market price ₹${price} is below minimum ₹${min}.` };
  }
  return { action: 'SELL', reason: `Market crossed ₹${min} and a local buyer is available.` };
}
