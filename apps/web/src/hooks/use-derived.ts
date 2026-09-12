'use client';

import { useMemo } from 'react';
import { DEFAULT_TARIFF, type CommunityDonation, type TradeRecord } from '@sunshare/shared';
import { co2AvoidedKg, gridEnergyDisplaced, treeEquivalent } from '@/lib/domain';
import { allDonations, allTrades, useStore } from '@/lib/store';
import { daySeries } from '@/lib/mock/market-engine';

export function useTariff() {
  return DEFAULT_TARIFF;
}

/** The current user's own meter, or null for roles without one. */
export function useMyReading() {
  const userId = useStore((s) => s.user.id);
  const readings = useStore((s) => s.readings);
  return useMemo(() => readings.find((r) => r.userId === userId) ?? null, [readings, userId]);
}

export interface DayLedger {
  soldKwh: number;
  soldDeliveredKwh: number;
  revenuePaise: number;
  grossPaise: number;
  wheelingPaise: number;
  boughtKwh: number;
  spendPaise: number;
  savingsPaise: number;
  avgSellPricePaise: number | null;
  avgBuyPricePaise: number | null;
  co2Kg: number;
  trades: TradeRecord[];
  donations: CommunityDonation[];
  donatedKwh: number;
}

/** Everything the current user has traded on the simulated day so far. */
export function useDayLedger(): DayLedger {
  const history = useStore((s) => s.history);
  const userId = useStore((s) => s.user.id);

  return useMemo(() => {
    const trades = allTrades({ history }).filter(
      (t) => t.sellerId === userId || t.buyerId === userId,
    );
    const donations = allDonations({ history }).filter((d) => d.donorId === userId);

    let soldKwh = 0;
    let soldDeliveredKwh = 0;
    let grossPaise = 0;
    let wheelingPaise = 0;
    let revenuePaise = 0;
    let boughtKwh = 0;
    let spendPaise = 0;
    let savingsPaise = 0;
    let co2Kg = 0;

    for (const t of trades) {
      if (t.status === 'FAILED') continue;
      co2Kg += t.co2AvoidedKg;
      if (t.sellerId === userId) {
        soldKwh += t.kwh;
        soldDeliveredKwh += t.deliveredKwh;
        grossPaise += t.grossPaise;
        wheelingPaise += t.wheelingFeePaise;
        revenuePaise += t.netToSellerPaise;
      } else {
        boughtKwh += t.deliveredKwh;
        spendPaise += t.grossPaise;
        savingsPaise += Math.round(
          t.deliveredKwh * (DEFAULT_TARIFF.retailTariffPaise - t.pricePaise),
        );
      }
    }

    return {
      soldKwh,
      soldDeliveredKwh,
      revenuePaise,
      grossPaise,
      wheelingPaise,
      boughtKwh,
      spendPaise,
      savingsPaise,
      avgSellPricePaise: soldDeliveredKwh > 0 ? Math.round(grossPaise / soldDeliveredKwh) : null,
      avgBuyPricePaise: boughtKwh > 0 ? Math.round(spendPaise / boughtKwh) : null,
      co2Kg,
      trades,
      donations,
      donatedKwh: donations.reduce((s, d) => s + d.kwh, 0),
    };
  }, [history, userId]);
}

/** Network-wide totals for the DISCOM and regulator surfaces. */
export function useNetworkLedger() {
  const history = useStore((s) => s.history);

  return useMemo(() => {
    let tradedKwh = 0;
    let deliveredKwh = 0;
    let lossKwh = 0;
    let grossPaise = 0;
    let wheelingPaise = 0;
    let trades = 0;
    let failed = 0;
    let backfillKwh = 0;
    let corridorBreaches = 0;
    const prices: number[] = [];

    for (const slot of history) {
      backfillKwh += slot.match.gridBackfillKwh;
      lossKwh += slot.match.totalLossKwh;
      if (slot.volumeKwh > 0) prices.push(slot.clearingPricePaise);
      if (
        slot.clearingPricePaise < DEFAULT_TARIFF.feedInTariffPaise ||
        slot.clearingPricePaise > DEFAULT_TARIFF.retailTariffPaise
      ) {
        corridorBreaches += 1;
      }
      for (const t of slot.trades) {
        trades += 1;
        if (t.status === 'FAILED') {
          failed += 1;
          continue;
        }
        tradedKwh += t.kwh;
        deliveredKwh += t.deliveredKwh;
        grossPaise += t.grossPaise;
        wheelingPaise += t.wheelingFeePaise;
      }
    }

    const donations = allDonations({ history });

    return {
      tradedKwh,
      deliveredKwh,
      lossKwh,
      grossPaise,
      wheelingPaise,
      trades,
      failed,
      backfillKwh,
      corridorBreaches,
      slots: history.length,
      avgClearingPaise: prices.length
        ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
        : null,
      co2Kg: co2AvoidedKg(deliveredKwh),
      displacedKwh: gridEnergyDisplaced(deliveredKwh),
      trees: treeEquivalent(co2AvoidedKg(deliveredKwh)),
      donations,
      donatedKwh: donations.reduce((s, d) => s + d.kwh, 0),
    };
  }, [history]);
}

/** The solar-day curve for a meter, or for the whole neighbourhood. */
export function useDaySeries(userId: string | null, stepMin = 10) {
  const mocked = useStore((s) => s.mocked);
  return useMemo(() => (mocked ? daySeries(userId, stepMin) : []), [mocked, userId, stepMin]);
}
