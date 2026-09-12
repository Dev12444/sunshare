'use client';

import type { MarketState, TariffContext } from '@sunshare/shared';
import { Metric } from '@/components/ui/metric';
import { Tag } from '@/components/ui/tag';
import { kwh, rupees, simClock, slotRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PriceCorridor } from './corridor';

/**
 * The market's current state, as one object.
 *
 * Price first, because everything else on every screen is downstream of it;
 * then the corridor that constrains it; then the three tariffs that define the
 * corridor. A user who reads only this panel still knows whether it is worth
 * trading right now.
 */
export function MarketSummary({
  market,
  tariff,
  className,
  compact = false,
}: {
  market: MarketState | null;
  tariff: TariffContext;
  className?: string;
  compact?: boolean;
}) {
  if (!market) {
    return (
      <div className={cn('px-3.5 py-6 text-sm text-ink-3', className)}>
        Waiting for the first market frame.
      </div>
    );
  }

  const cleared = market.lastClearingPricePaise != null;
  const price = market.lastClearingPricePaise ?? market.indicativePricePaise;
  const balance = market.totalSupplyKwh - market.totalDemandKwh;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-start justify-between gap-4 px-3.5 pt-3">
        <Metric
          label={cleared ? 'Clearing price' : 'Indicative price'}
          value={rupees(price)}
          unit="/kWh"
          size="lg"
          tone="solar"
          flash={price}
          hint={
            cleared
              ? `Slot ${slotRange(market.slotId)} · uniform price`
              : 'No slot has cleared yet — reference price'
          }
        />
        <div className="text-right">
          <Tag tone={balance >= 0 ? 'up' : 'warn'}>
            {balance >= 0 ? 'Surplus market' : 'Demand-led'}
          </Tag>
          <div className="mt-1.5 font-mono text-xs tabular-nums text-ink-3">
            {kwh(market.totalSupplyKwh)} supply / {kwh(market.totalDemandKwh)} demand
          </div>
        </div>
      </div>

      <div className="px-3.5 pb-3 pt-3.5">
        <PriceCorridor
          tariff={tariff}
          clearingPricePaise={market.lastClearingPricePaise}
          indicativePricePaise={market.indicativePricePaise}
        />
      </div>

      {!compact ? (
        <dl className="grid grid-cols-3 border-t border-rule/[.13] hair-x">
          <TariffCell
            label="Feed-in"
            value={rupees(tariff.feedInTariffPaise)}
            note="Seller's floor"
          />
          <TariffCell
            label="Retail"
            value={rupees(tariff.retailTariffPaise)}
            note="Buyer's ceiling"
          />
          <TariffCell
            label="Wheeling"
            value={rupees(tariff.wheelingChargePaise)}
            note="DISCOM per kWh"
          />
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule/[.13] px-3.5 py-2 text-xs text-ink-3">
        <span>
          Next slot opens{' '}
          <span className="font-mono tabular-nums text-ink-2">{simClock(market.slotEndSim)}</span>
        </span>
        <span>
          <span className="font-mono tabular-nums text-ink-2">{market.activeListings}</span> listings ·{' '}
          <span className="font-mono tabular-nums text-ink-2">{market.activeBids}</span> bids
        </span>
      </div>
    </div>
  );
}

function TariffCell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-3.5 py-2.5">
      <dt className="text-label font-semibold uppercase text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-ink">{value}</dd>
      <dd className="mt-0.5 text-xs text-ink-3">{note}</dd>
    </div>
  );
}

/**
 * The corridor explained in words, once per surface where somebody might be
 * seeing this market for the first time.
 */
export function CorridorNote({ tariff }: { tariff: TariffContext }) {
  return (
    <p className="text-xs leading-relaxed text-ink-2">
      Every trade clears inside the corridor. A seller never receives less than the{' '}
      <span className="font-mono tabular-nums">{rupees(tariff.feedInTariffPaise)}</span> feed-in
      tariff they would have got from the DISCOM, and a buyer never pays more than the{' '}
      <span className="font-mono tabular-nums">{rupees(tariff.retailTariffPaise)}</span> retail
      tariff they would have paid to import. The{' '}
      <span className="font-mono tabular-nums">{rupees(tariff.wheelingChargePaise)}</span> wheeling
      charge on each traded unit goes to the DISCOM for use of the wires.{' '}
      <span className="text-ink-3">Tariffs are illustrative pending the state tariff order.</span>
    </p>
  );
}
