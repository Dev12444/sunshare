/**
 * AI energy broker — platform side. Rahi, feature #1.
 *
 * The engine turns a natural-language goal into a validated BrokerPolicy and
 * decides one step at a time. Nothing here lets the model move energy or money:
 * it produces a policy, a deterministic executor in the engine returns an
 * action, and this file applies that action to the order book — clamping any
 * price into the corridor on the way through, because a policy that arrived
 * from a language model is exactly the input you do not trust.
 *
 * Every decision is persisted with its stated reason. That log is the Agent
 * Activity feed, which is the artifact a judge actually reads.
 */
import type { BrokerDecision, BrokerPolicy, Listing } from '@sunshare/shared';
import { DEFAULT_TARIFF } from '@sunshare/shared';
import { prisma } from './prisma';
import { publish } from './bus';
import type { SlotWindow } from './slot';

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

async function engineJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ENGINE}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`engine ${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

const clampToCorridor = (paise: number) =>
  Math.min(
    Math.max(Math.round(paise), DEFAULT_TARIFF.feedInTariffPaise),
    DEFAULT_TARIFF.retailTariffPaise,
  );

export async function createPolicy(userId: string, goal: string): Promise<BrokerPolicy> {
  const policy = await engineJson<BrokerPolicy>('/broker/policy', { userId, goal });

  // The engine's own id is kept so its logs and these rows line up.
  await prisma.brokerPolicy.create({
    data: {
      id: policy.id,
      userId,
      rawGoal: policy.rawGoal,
      objective: policy.objective,
      minPricePaise: clampToCorridor(policy.minPricePaise),
      maxPricePaise: clampToCorridor(policy.maxPricePaise),
      urgency: policy.urgency,
      reserveKwh: policy.reserveKwh,
      communityDonationPct: policy.communityDonationPct,
      validUntilSim: new Date(policy.validUntilSim),
      rationale: policy.rationale,
      source: policy.source,
    },
  });

  return policy;
}

function toEnginePolicy(row: {
  id: string;
  userId: string;
  rawGoal: string;
  objective: string;
  minPricePaise: number;
  maxPricePaise: number;
  urgency: number;
  reserveKwh: number;
  communityDonationPct: number;
  validUntilSim: Date;
  rationale: string;
  source: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    userId: row.userId,
    rawGoal: row.rawGoal,
    objective: row.objective,
    minPricePaise: row.minPricePaise,
    maxPricePaise: row.maxPricePaise,
    urgency: row.urgency,
    reserveKwh: row.reserveKwh,
    communityDonationPct: row.communityDonationPct,
    validUntilSim: row.validUntilSim.toISOString(),
    rationale: row.rationale,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Runs one executor step per live policy and applies the result to the book.
 * Called before matching, so anything the broker lists is matched this slot.
 */
export async function runBrokerForSlot(slot: SlotWindow): Promise<BrokerDecision[]> {
  const policies = await prisma.brokerPolicy.findMany({
    where: { validUntilSim: { gt: slot.startSim } },
    orderBy: { createdAt: 'desc' },
  });

  const decisions: BrokerDecision[] = [];
  const seen = new Set<string>();

  for (const policy of policies) {
    // Only the newest live policy per user drives the book; an older one that
    // has not expired should not fight it for the same listing.
    if (seen.has(policy.userId)) continue;
    seen.add(policy.userId);

    const openListing = await prisma.listing.findFirst({
      where: { sellerId: policy.userId, slotId: slot.id, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });

    let decision: BrokerDecision;
    try {
      decision = await engineJson<BrokerDecision>('/broker/step', {
        policy: toEnginePolicy(policy),
        listing: openListing
          ? ({
              id: openListing.id,
              sellerId: openListing.sellerId,
              meterId: openListing.meterId,
              nodeId: openListing.nodeId,
              kwh: openListing.kwh,
              askPricePaise: openListing.askPricePaise,
              slotId: openListing.slotId,
              expiresAtSim: openListing.expiresAtSim.toISOString(),
              status: openListing.status,
              brokerPolicyId: openListing.brokerPolicyId,
            } satisfies Listing)
          : null,
      });
    } catch (err) {
      console.error(`broker step failed for ${policy.userId}`, err);
      continue;
    }

    await applyDecision(policy.userId, policy.id, decision, slot, openListing?.id ?? null);

    await prisma.brokerDecision.create({
      data: {
        id: decision.id,
        policyId: policy.id,
        slotId: slot.id,
        tsSim: new Date(decision.tsSim),
        action: decision.action,
        kwh: decision.kwh,
        fromPricePaise: decision.fromPricePaise,
        toPricePaise: decision.toPricePaise,
        reason: decision.reason,
        inputs: decision.inputs,
      },
    });

    decisions.push(decision);
    publish({ type: 'broker', data: decision });
  }

  return decisions;
}

async function applyDecision(
  userId: string,
  policyId: string,
  decision: BrokerDecision,
  slot: SlotWindow,
  openListingId: string | null,
): Promise<void> {
  const price = decision.toPricePaise === null ? null : clampToCorridor(decision.toPricePaise);

  switch (decision.action) {
    case 'LIST': {
      if (decision.kwh <= 0 || price === null) return;

      const meter = await prisma.meter.findFirst({ where: { userId } });
      if (!meter) return;

      await prisma.listing.create({
        data: {
          sellerId: userId,
          meterId: meter.id,
          nodeId: meter.nodeId,
          kwh: decision.kwh,
          askPricePaise: price,
          slotId: slot.id,
          expiresAtSim: slot.endSim,
          brokerPolicyId: policyId,
        },
      });
      return;
    }

    case 'REPRICE': {
      if (!openListingId || price === null) return;
      await prisma.listing.update({
        where: { id: openListingId },
        data: { askPricePaise: price, brokerPolicyId: policyId },
      });
      return;
    }

    case 'WITHDRAW': {
      if (!openListingId) return;
      await prisma.listing.update({
        where: { id: openListingId },
        data: { status: 'WITHDRAWN' },
      });
      return;
    }

    // HOLD does nothing by definition; DONATE is settled by the community pool
    // after the trade, not by moving anything on the book here.
    default:
      return;
  }
}

/** The Agent Activity feed. */
export async function brokerFeed(userId: string) {
  const policies = await prisma.brokerPolicy.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      decisions: { orderBy: { tsSim: 'desc' }, take: 50 },
    },
  });

  return policies.map((policy) => ({
    id: policy.id,
    rawGoal: policy.rawGoal,
    objective: policy.objective,
    minPricePaise: policy.minPricePaise,
    maxPricePaise: policy.maxPricePaise,
    urgency: policy.urgency,
    reserveKwh: policy.reserveKwh,
    communityDonationPct: policy.communityDonationPct,
    validUntilSim: policy.validUntilSim.toISOString(),
    rationale: policy.rationale,
    source: policy.source,
    createdAt: policy.createdAt.toISOString(),
    decisions: policy.decisions.map((d) => ({
      id: d.id,
      slotId: d.slotId,
      tsSim: d.tsSim.toISOString(),
      action: d.action,
      kwh: d.kwh,
      fromPricePaise: d.fromPricePaise,
      toPricePaise: d.toPricePaise,
      reason: d.reason,
      inputs: d.inputs,
      createdAt: d.createdAt.toISOString(),
    })),
  }));
}
