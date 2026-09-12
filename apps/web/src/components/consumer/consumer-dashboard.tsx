'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { TradeRecord } from '@sunshare/shared';
import { SolarDayChart } from '@/components/charts/solar-day-chart';
import { PriceChart } from '@/components/charts/price-chart';
import { MarketSummary } from '@/components/market/market-summary';
import { OrderBookSide, toRows, useBookSort, type BookRow } from '@/components/market/order-book';
import { BidForm } from '@/components/market/order-forms';
import { TradeReceipt } from '@/components/market/trade-receipt';
import { TradeTable } from '@/components/market/trade-table';
import { Button } from '@/components/ui/controls';
import { DRAWER, Inspector } from '@/components/ui/inspector';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { EmptyState, MetricSkeleton } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { priceSeries } from '@/lib/mock/market-engine';
import { kgCo2, km, kwh, pct, rupees, simClock } from '@/lib/format';
import { displayName, feederOf, fullName, substationOf } from '@/lib/seed';
import { allReceipts, setState, useStore } from '@/lib/store';
import { useDayLedger, useDaySeries, useMyReading, useTariff } from '@/hooks/use-derived';
import { useRoleSurface } from '@/hooks/use-role-surface';

/**
 * Consumer overview.
 *
 * A buyer's question is the mirror of a seller's: what am I drawing, what can
 * I get locally instead of from the grid, and what did that save me. Savings
 * is the headline number because it is the only reason a household would
 * switch away from simply importing.
 */
export function ConsumerDashboard() {
  useRoleSurface('CONSUMER');
  const user = useStore((s) => s.user);
  const market = useStore((s) => s.market);
  const history = useStore((s) => s.history);
  const listings = useStore((s) => s.openListings);
  const bids = useStore((s) => s.openBids);
  const myBids = useStore((s) => s.myBids);
  const simMinutes = useStore((s) => s.simMinutes);
  const receipts = useStore(allReceipts);

  const reading = useMyReading();
  const ledger = useDayLedger();
  const tariff = useTariff();
  const neighbourhoodSeries = useDaySeries(null);
  const { sort, apply, onSortChange } = useBookSort();

  const [bidOpen, setBidOpen] = useState(false);
  const [selected, setSelected] = useState<TradeRecord | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<BookRow | null>(null);

  const demandKw = Math.max(0, -(reading?.surplusKw ?? 0));
  const remainingHours = (15 - (simMinutes % 15)) / 60;
  const shortfallKwh = demandKw * Math.max(remainingHours, 0.05);
  const clearing = market?.lastClearingPricePaise ?? null;
  const activeBid = myBids.find((b) => b.status === 'OPEN' && b.slotId === market?.slotId);

  const supplyRows = useMemo(
    () => apply(toRows(listings, [], user.nodeId, user.id).filter((r) => r.side === 'SELL'), 'SELL'),
    [apply, listings, user.nodeId, user.id],
  );
  const nearbySupplyKwh = supplyRows.reduce((s, r) => s + r.kwh, 0);
  const nearest = supplyRows.reduce<BookRow | null>(
    (best, r) => (best == null || r.distanceKm < best.distanceKm ? r : best),
    null,
  );

  return (
    <div className="space-y-4">
      <PageHead
        title={fullName(user.id)}
        subtitle={
          reading
            ? `No rooftop · ${feederOf(reading.nodeId)} · ${substationOf(reading.nodeId)}`
            : 'Consumer premises'
        }
        aside={
          <Button variant="primary" onClick={() => setBidOpen(true)}>
            Place bid
          </Button>
        }
      />

      <Panel>
        <MetricRow>
          {reading ? (
            <>
              <MetricCell>
                <Metric
                  label="Current demand"
                  value={kwh(reading.consumptionKw)}
                  unit="kW"
                  tone="mains"
                  flash={reading.consumptionKw}
                  hint={`${kwh(shortfallKwh)} kWh this slot`}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Purchased today"
                  value={kwh(ledger.boughtKwh)}
                  unit="kWh"
                  hint={`${ledger.trades.filter((t) => t.buyerId === user.id).length} purchases`}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Average paid"
                  value={ledger.avgBuyPricePaise ? rupees(ledger.avgBuyPricePaise) : '—'}
                  unit="/kWh"
                  hint={`Retail ${rupees(tariff.retailTariffPaise)}`}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Clearing price"
                  value={rupees(clearing ?? market?.indicativePricePaise ?? 0)}
                  unit="/kWh"
                  tone="solar"
                  flash={clearing ?? undefined}
                  hint={clearing ? 'Last cleared slot' : 'Indicative'}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Saved vs retail"
                  value={rupees(ledger.savingsPaise)}
                  tone="up"
                  hint="Against importing the same units"
                />
              </MetricCell>
              <MetricCell>
                <Metric label="CO₂ avoided" value={kgCo2(ledger.co2Kg)} hint="Versus grid supply" />
              </MetricCell>
            </>
          ) : (
            ['Current demand', 'Purchased today', 'Average paid', 'Clearing price', 'Saved vs retail', 'CO₂ avoided'].map(
              (l) => <MetricSkeleton key={l} label={l} />,
            )
          )}
        </MetricRow>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/[.13] px-3.5 py-2.5">
              <div className="flex items-baseline gap-2.5">
                <span className="text-label font-semibold uppercase text-ink-2">
                  Available nearby
                </span>
                <span className="text-xs text-ink-3">
                  {kwh(nearbySupplyKwh)} kWh offered in this slot
                </span>
              </div>
              {nearest ? (
                <span className="text-xs text-ink-3">
                  Nearest {displayName(nearest.counterpartyId)} · {km(nearest.distanceKm)} ·{' '}
                  {pct(nearest.lossPct)} loss
                </span>
              ) : null}
            </div>
            <OrderBookSide
              side="SELL"
              rows={supplyRows}
              tariff={tariff}
              clearingPricePaise={clearing}
              onSelect={setSelectedOrder}
              selectedId={selectedOrder?.id}
              sort={sort}
              onSortChange={onSortChange}
              maxHeight={280}
            />
          </Panel>

          <Panel>
            <PanelHead title="Neighbourhood generation" meta="All twelve premises · 10-minute resolution" />
            <PanelBody>
              <SolarDayChart
                data={neighbourhoodSeries}
                nowMinute={simMinutes}
                height={200}
                ariaLabel="Neighbourhood generation against total demand across the simulated day."
              />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead
              title="Recent purchases"
              meta={`${ledger.trades.length} today`}
              actions={
                <Link
                  href="/ledger"
                  className="rounded-sm px-1.5 py-1 text-xs text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  Full ledger
                </Link>
              }
            />
            <TradeTable
              trades={ledger.trades.slice(0, 12)}
              userId={user.id}
              onSelect={setSelected}
              selectedId={selected?.id}
              empty={
                <EmptyState
                  title="No purchases yet today"
                  action={
                    <Button size="sm" variant="primary" onClick={() => setBidOpen(true)}>
                      Place bid
                    </Button>
                  }
                >
                  Bid for local surplus and you pay the uniform clearing price, never more than the{' '}
                  {rupees(tariff.retailTariffPaise)} retail tariff.
                </EmptyState>
              }
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead title="Market" />
            <MarketSummary market={market} tariff={tariff} />
          </Panel>

          <Panel>
            <PanelHead title="Active bid" />
            {activeBid ? (
              <PanelBody className="space-y-3">
                <Tag tone="solar" dot>
                  Open
                </Tag>
                <dl>
                  <DataRow label="Energy">{kwh(activeBid.kwh)} kWh</DataRow>
                  <DataRow label="Limit">{rupees(activeBid.maxPricePaise)}/kWh</DataRow>
                  <DataRow label="Slot">{activeBid.slotId.slice(11)}</DataRow>
                  <DataRow label="Maximum cost">
                    {rupees(Math.round(activeBid.kwh * activeBid.maxPricePaise))}
                  </DataRow>
                </dl>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    setState((s) => ({
                      myBids: s.myBids.map((b) =>
                        b.id === activeBid.id ? { ...b, status: 'WITHDRAWN' as const } : b,
                      ),
                    }))
                  }
                >
                  Cancel bid
                </Button>
              </PanelBody>
            ) : (
              <EmptyState
                title="No active bid"
                action={
                  <Button size="sm" variant="primary" onClick={() => setBidOpen(true)}>
                    Place bid
                  </Button>
                }
              >
                Your forecast shortfall this slot is{' '}
                <span className="font-mono tabular-nums text-ink">{kwh(shortfallKwh)} kWh</span>.
                Without a bid, that demand is met by grid backfill at the retail tariff.
              </EmptyState>
            )}
          </Panel>

          <Panel>
            <PanelHead title="Clearing price" meta={`${history.length} slots today`} />
            <PanelBody>
              <PriceChart data={priceSeries(history)} tariff={tariff} height={150} showVolume={false} />
            </PanelBody>
          </Panel>
        </div>
      </div>

      <Inspector
        open={bidOpen}
        onClose={() => setBidOpen(false)}
        eyebrow="Buy"
        title="Place bid"
        className={DRAWER}
      >
        <BidForm suggestedKwh={Math.max(0.2, shortfallKwh)} onDone={() => setBidOpen(false)} />
      </Inspector>

      <Inspector
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        eyebrow="Trade receipt"
        title={selected?.id ?? ''}
        className={DRAWER}
      >
        {selected ? (
          <TradeReceipt
            trade={selected}
            receipt={receipts.get(selected.id) ?? null}
            tariff={tariff}
            userId={user.id}
          />
        ) : null}
      </Inspector>

      <Inspector
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        eyebrow="Sell listing"
        title={selectedOrder ? fullName(selectedOrder.counterpartyId) : ''}
        className={DRAWER}
        footer={
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setSelectedOrder(null);
              setBidOpen(true);
            }}
          >
            Bid for this supply
          </Button>
        }
      >
        {selectedOrder ? (
          <dl>
            <DataRow label="Seller">{fullName(selectedOrder.counterpartyId)}</DataRow>
            <DataRow label="Offered">{kwh(selectedOrder.kwh)} kWh</DataRow>
            <DataRow label="Ask">{rupees(selectedOrder.pricePaise)}/kWh</DataRow>
            <DataRow label="Distance">{km(selectedOrder.distanceKm)}</DataRow>
            <DataRow label="Transmission loss" tone={selectedOrder.lossPct > 2.5 ? 'warn' : 'neutral'}>
              {pct(selectedOrder.lossPct)}
            </DataRow>
            <DataRow label="Delivered to you">
              {kwh(selectedOrder.kwh * (1 - selectedOrder.lossPct / 100))} kWh
            </DataRow>
            <DataRow label="Feeder">{selectedOrder.feeder}</DataRow>
            <DataRow label="Saving vs retail" tone="up">
              {rupees(tariff.retailTariffPaise - selectedOrder.pricePaise)}/kWh
            </DataRow>
            <DataRow label="Slot closes">{market ? simClock(market.slotEndSim) : '—'}</DataRow>
          </dl>
        ) : null}
      </Inspector>
    </div>
  );
}
