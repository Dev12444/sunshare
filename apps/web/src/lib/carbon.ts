/**
 * Carbon ledger and badges — Rahi, H17–H19.
 *
 * ATTRIBUTION: a trade's avoided emissions are credited in full to BOTH the
 * seller and the buyer, because this drives each person's own gamified total
 * and halving it would make both numbers look wrong to the person reading them.
 * The consequence is that summing CarbonLedger across users double counts.
 * Network-level totals must therefore come from Trade.co2AvoidedKg, never from
 * this table — `networkCarbonKg()` below is the only correct source for that.
 */
import type { Badge, CarbonSummary } from '@sunshare/shared';
import {
  BADGE_DEFINITIONS,
  CO2_AVOIDED_PER_KWH,
  GRID_EMISSION_FACTOR,
  KG_CO2_PER_TREE_YEAR,
} from '@sunshare/shared';
import type { Prisma, Trade } from '@prisma/client';
import { prisma } from './prisma';
import { publish } from './bus';
import { sendToUser } from './push';

/** Both sides of every trade get a ledger row. See the attribution note above. */
export async function recordCarbonForTrades(
  tx: Prisma.TransactionClient,
  trades: Trade[],
): Promise<void> {
  if (trades.length === 0) return;

  await tx.carbonLedger.createMany({
    data: trades.flatMap((trade) => [
      {
        userId: trade.sellerId,
        tradeId: trade.id,
        localKwh: trade.deliveredKwh,
        co2AvoidedKg: trade.co2AvoidedKg,
      },
      {
        userId: trade.buyerId,
        tradeId: trade.id,
        localKwh: trade.deliveredKwh,
        co2AvoidedKg: trade.co2AvoidedKg,
      },
    ]),
  });
}

export interface UserTotals {
  trades: number;
  localKwh: number;
  soldKwh: number;
  donatedKwh: number;
  co2AvoidedKg: number;
}

export async function totalsFor(userId: string): Promise<UserTotals> {
  const [ledger, sold, donated] = await Promise.all([
    prisma.carbonLedger.aggregate({
      where: { userId },
      _sum: { localKwh: true, co2AvoidedKg: true },
      _count: true,
    }),
    prisma.trade.aggregate({
      where: { sellerId: userId },
      _sum: { deliveredKwh: true },
    }),
    prisma.donation.aggregate({
      where: { donorId: userId },
      _sum: { kwh: true },
    }),
  ]);

  return {
    trades: ledger._count,
    localKwh: ledger._sum.localKwh ?? 0,
    soldKwh: sold._sum.deliveredKwh ?? 0,
    donatedKwh: donated._sum.kwh ?? 0,
    co2AvoidedKg: ledger._sum.co2AvoidedKg ?? 0,
  };
}

/** The metric each badge measures progress against. */
function metricFor(code: string, totals: UserTotals): number {
  switch (code) {
    case 'FIRST_TRADE':
      return totals.trades;
    case 'LOCAL_10':
      return totals.localKwh;
    case 'SUN_BARON':
      return totals.soldKwh;
    case 'COMMUNITY_HERO':
      return totals.donatedKwh;
    case 'CARBON_CENTURY':
      return totals.co2AvoidedKg;
    default:
      return 0;
  }
}

export async function badgesFor(userId: string): Promise<Badge[]> {
  const [totals, unlocked] = await Promise.all([
    totalsFor(userId),
    prisma.userBadge.findMany({ where: { userId } }),
  ]);

  const unlockedAt = new Map(unlocked.map((b) => [b.code, b.unlockedAt]));

  return BADGE_DEFINITIONS.map((definition) => {
    const progress = metricFor(definition.code, totals);
    const at = unlockedAt.get(definition.code);

    return {
      ...definition,
      unlockedAt: at ? at.toISOString() : null,
      progressPct: Math.min(100, (progress / definition.threshold) * 100),
    };
  });
}

/** Unlocks anything newly earned and announces it. Safe to call repeatedly. */
export async function awardBadges(userIds: string[]): Promise<number> {
  let unlocked = 0;

  for (const userId of new Set(userIds)) {
    const totals = await totalsFor(userId);

    for (const definition of BADGE_DEFINITIONS) {
      if (metricFor(definition.code, totals) < definition.threshold) continue;

      // The unique [userId, code] constraint makes this idempotent; a row that
      // already exists means the badge was announced on an earlier slot.
      const existing = await prisma.userBadge.findUnique({
        where: { userId_code: { userId, code: definition.code } },
      });
      if (existing) continue;

      const row = await prisma.userBadge.create({
        data: { userId, code: definition.code },
      });
      unlocked += 1;

      publish({
        type: 'badge',
        data: {
          ...definition,
          unlockedAt: row.unlockedAt.toISOString(),
          progressPct: 100,
        },
      });

      await sendToUser(userId, {
        title: `${definition.icon} ${definition.title} unlocked`,
        body: definition.description,
        url: '/impact',
        tag: `badge-${definition.code}`,
        icon: '/icons/icon-192.png',
      });
    }
  }

  return unlocked;
}

/** The only correct network total — the ledger double counts by design. */
export async function networkCarbonKg(): Promise<number> {
  const total = await prisma.trade.aggregate({ _sum: { co2AvoidedKg: true } });
  return total._sum.co2AvoidedKg ?? 0;
}

export async function carbonSummaryFor(userId: string): Promise<CarbonSummary> {
  const totals = await totalsFor(userId);

  const byUser = await prisma.carbonLedger.groupBy({
    by: ['userId'],
    _sum: { co2AvoidedKg: true },
    orderBy: { _sum: { co2AvoidedKg: 'desc' } },
  });

  const position = byUser.findIndex((row) => row.userId === userId);

  const period = await prisma.carbonLedger.aggregate({
    where: { userId },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });

  const now = new Date();

  return {
    userId,
    periodStart: (period._min.createdAt ?? now).toISOString(),
    periodEnd: (period._max.createdAt ?? now).toISOString(),
    localKwh: totals.localKwh,
    co2AvoidedKg: totals.co2AvoidedKg,
    treeEquivalent: totals.co2AvoidedKg / KG_CO2_PER_TREE_YEAR,
    // What the same energy would have emitted drawn from the grid instead.
    gridComparisonKg: totals.localKwh * GRID_EMISSION_FACTOR,
    rank: position >= 0 ? position + 1 : null,
  };
}

/** Exposed so the summary and the engine agree on the per-kWh figure. */
export const CO2_PER_KWH = CO2_AVOIDED_PER_KWH;
