'use client';

import { useMemo, useState } from 'react';
import { DepthChart } from '@/components/charts/depth-chart';
import { PriceChart } from '@/components/charts/price-chart';
import { Button, Field, SegmentedControl, Select } from '@/components/ui/controls';
import { DRAWER, Inspector } from '@/components/ui/inspector';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { Tabs } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { EmptyState } from '@/components/ui/states';
import { km, kwh, pct, rupees, simClock, slotRange } from '@/lib/format';
import { NODE_BY_ID, displayName, fullName, substationOf } from '@/lib/seed';
import { priceSeries } from '@/lib/mock/market-engine';
import { setState, useStore } from '@/lib/store';
import { useTariff } from '@/hooks/use-derived';
import { CorridorNote, MarketSummary } from './market-summary';
import { OrderBookSide, toRows, useBookSort, type BookRow } from './order-book';
import { BidForm, ListingForm } from './order-forms';

type Composer = 'listing' | 'bid' | null;
type FeederFilter = 'ALL' | 'MINE' | 'F-1' | 'F-2' | 'F-3' | 'F-4';

/**
 * The marketplace.
 *
 * A book, a depth curve and a price history — the three things a trading
 * screen owes you — plus the corridor, which is the thing that makes this
 * market different from any other order book. The composer opens as an
 * inspector so the book stays on screen while an order is being written
 * against it.
 */
export function MarketplaceView() {
  const market = useStore((s) => s.market);
  const history = useStore((s) => s.history);
  const listings = useStore((s) => s.openListings);
  const bids = useStore((s) => s.openBids);
  const user = useStore((s) => s.user);
  const readings = useStore((s) => s.readings);
  const simMinutes = useStore((s) => s.simMinutes);
  const tariff = useTariff();

  const [composer, setComposer] = useState<Composer>(null);
  const [selected, setSelected] = useState<BookRow | null>(null);
  const [side, setSide] = useState<'SELL' | 'BUY'>('SELL');
  const [feeder, setFeeder] = useState<FeederFilter>('ALL');
  const [onlyMatching, setOnlyMatching] = useState(false);
  const { sort, apply, onSortChange } = useBookSort();

  const clearing = market?.lastClearingPricePaise ?? null;
  const reading = readings.find((r) => r.userId === user.id) ?? null;
  const remainingHours = (15 - (simMinutes % 15)) / 60;
  const availableKwh = Math.max(0, reading?.surplusKw ?? 0) * Math.max(remainingHours, 0.05);
  const shortfallKwh = Math.max(0, -(reading?.surplusKw ?? 0)) * Math.max(remainingHours, 0.05);

  const rows = useMemo(
    () => toRows(listings, bids, user.nodeId, user.id),
    [listings, bids, user.nodeId, user.id],
  );

  const filtered = useMemo(() => {
    const myFeeder = user.nodeId ? NODE_BY_ID.get(user.nodeId)?.parentId : null;
    return rows.filter((r) => {
      if (feeder === 'MINE' && r.feeder !== myFeeder) return false;
      if (feeder !== 'ALL' && feeder !== 'MINE' && r.feeder !== feeder) return false;
      if (onlyMatching && clearing != null) {
        const clears = r.side === 'SELL' ? r.pricePaise <= clearing : r.pricePaise >= clearing;
        if (!clears) return false;
      }
      return true;
    });
  }, [rows, feeder, onlyMatching, clearing, user.nodeId]);

  const sells = apply(filtered.filter((r) => r.side === 'SELL'), 'SELL');
  const buys = apply(filtered.filter((r) => r.side === 'BUY'), 'BUY');

  const lastSlot = history[history.length - 1];
  const supply = listings.reduce((s, l) => s + l.kwh, 0);
  const demand = bids.reduce((s, b) => s + b.kwh, 0);

  return (
    <div className="space-y-4">
      <PageHead
        stage="MARKET"
        title="Marketplace"
        subtitle="Sector 21 local energy market · uniform-price double auction on 15-minute slots"
        aside={
          <div className="flex gap-2">
            <Button onClick={() => setComposer('bid')}>Place bid</Button>
            <Button variant="primary" onClick={() => setComposer('listing')}>
              Create listing
            </Button>
          </div>
        }
      />

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric
              label="Clearing price"
              value={rupees(clearing ?? market?.indicativePricePaise ?? 0)}
              unit="/kWh"
              tone="solar"
              size="lg"
              flash={clearing ?? undefined}
              hint={clearing ? 'Last cleared slot' : 'Indicative — no slot cleared yet'}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Current slot"
              value={market ? slotRange(market.slotId) : '—'}
              hint={market ? `Closes ${simClock(market.slotEndSim)}` : undefined}
              size="sm"
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Supply offered"
              value={kwh(supply)}
              unit="kWh"
              size="sm"
              hint={`${listings.length} listings`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Demand bid"
              value={kwh(demand)}
              unit="kWh"
              size="sm"
              hint={`${bids.length} bids`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Last slot matched"
              value={kwh(lastSlot?.match.totalMatchedKwh ?? 0)}
              unit="kWh"
              size="sm"
              tone="up"
              hint={
                lastSlot
                  ? `${lastSlot.match.pairs.length} matches · ${pct(lastSlot.match.avgEfficiencyPct)} delivered`
                  : 'No slot cleared yet'
              }
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Grid backfill"
              value={kwh(lastSlot?.match.gridBackfillKwh ?? 0)}
              unit="kWh"
              size="sm"
              tone={(lastSlot?.match.gridBackfillKwh ?? 0) > 0 ? 'warn' : 'neutral'}
              hint="Demand the local market could not serve"
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/[.13] px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-label font-semibold uppercase text-ink-2">Order book</span>
                <span className="text-xs text-ink-3">
                  {market ? `Slot ${market.slotId.slice(11)}` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Filter by feeder"
                  value={feeder}
                  onChange={(e) => setFeeder((e.target as HTMLSelectElement).value as FeederFilter)}
                  className="h-7 w-auto text-xs"
                >
                  <option value="ALL">All feeders</option>
                  <option value="MINE">My feeder</option>
                  <option value="F-1">Feeder 1</option>
                  <option value="F-2">Feeder 2</option>
                  <option value="F-3">Feeder 3</option>
                  <option value="F-4">Feeder 4</option>
                </Select>
                <SegmentedControl
                  size="sm"
                  label="Order filter"
                  value={onlyMatching ? 'matching' : 'all'}
                  onChange={(v) => setOnlyMatching(v === 'matching')}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'matching', label: 'Matching' },
                  ]}
                />
              </div>
            </div>

            {/* Phones get one side at a time; desktops get the real book. */}
            <div className="border-b border-rule/[.13] lg:hidden">
              <Tabs
                label="Book side"
                value={side}
                onChange={setSide}
                tabs={[
                  { value: 'SELL', label: 'Sell listings', count: sells.length },
                  { value: 'BUY', label: 'Buy bids', count: buys.length },
                ]}
              />
            </div>

            <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-rule/[.13]">
              <div className={side === 'SELL' ? '' : 'hidden lg:block'}>
                <div className="hidden items-center justify-between border-b border-rule/[.09] px-3 py-1.5 lg:flex">
                  <span className="text-label font-semibold uppercase text-solar-deep">
                    Sell listings
                  </span>
                  <span className="font-mono text-xs tabular-nums text-ink-3">
                    {kwh(sells.reduce((s, r) => s + r.kwh, 0))} kWh
                  </span>
                </div>
                <OrderBookSide
                  side="SELL"
                  rows={sells}
                  tariff={tariff}
                  clearingPricePaise={clearing}
                  onSelect={setSelected}
                  selectedId={selected?.id}
                  maxHeight={332}
                  sort={sort}
                  onSortChange={onSortChange}
                />
              </div>
              <div className={side === 'BUY' ? '' : 'hidden lg:block'}>
                <div className="hidden items-center justify-between border-b border-rule/[.09] px-3 py-1.5 lg:flex">
                  <span className="text-label font-semibold uppercase text-mains">Buy bids</span>
                  <span className="font-mono text-xs tabular-nums text-ink-3">
                    {kwh(buys.reduce((s, r) => s + r.kwh, 0))} kWh
                  </span>
                </div>
                <OrderBookSide
                  side="BUY"
                  rows={buys}
                  tariff={tariff}
                  clearingPricePaise={clearing}
                  onSelect={setSelected}
                  selectedId={selected?.id}
                  maxHeight={332}
                  sort={sort}
                  onSortChange={onSortChange}
                />
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead title="Depth" meta="Cumulative supply and demand" />
              <PanelBody>
                <DepthChart
                  listings={listings}
                  bids={bids}
                  tariff={tariff}
                  clearingPricePaise={clearing}
                />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHead title="Clearing price" meta={`${history.length} slots today`} />
              <PanelBody>
                <PriceChart data={priceSeries(history)} tariff={tariff} height={168} />
              </PanelBody>
            </Panel>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead title="Market" />
            <MarketSummary market={market} tariff={tariff} />
          </Panel>

          <Panel>
            <PanelHead title="Price corridor" />
            <PanelBody>
              <CorridorNote tariff={tariff} />
            </PanelBody>
          </Panel>

          {lastSlot ? (
            <Panel>
              <PanelHead title="Last match" meta={`Slot ${lastSlot.slotId.slice(11)}`} />
              <PanelBody>
                <dl>
                  <DataRow label="Clearing price">{rupees(lastSlot.clearingPricePaise)}/kWh</DataRow>
                  <DataRow label="Matched">{kwh(lastSlot.match.totalMatchedKwh)} kWh</DataRow>
                  <DataRow label="Delivered">{kwh(lastSlot.match.totalDeliveredKwh)} kWh</DataRow>
                  <DataRow label="Line loss" tone="warn">
                    {kwh(lastSlot.match.totalLossKwh)} kWh · {pct(100 - lastSlot.match.avgEfficiencyPct)}
                  </DataRow>
                  <DataRow label="Unmatched supply">
                    {kwh(lastSlot.match.unmatchedSupplyKwh)} kWh
                  </DataRow>
                  <DataRow label="Grid backfill">{kwh(lastSlot.match.gridBackfillKwh)} kWh</DataRow>
                  <DataRow label="Algorithm">{lastSlot.match.algorithm}</DataRow>
                  <DataRow label="Compute">{lastSlot.match.computeMs.toFixed(1)} ms</DataRow>
                </dl>
              </PanelBody>
            </Panel>
          ) : null}
        </div>
      </div>

      <Inspector
        open={composer !== null}
        onClose={() => setComposer(null)}
        eyebrow={composer === 'listing' ? 'Sell' : 'Buy'}
        title={composer === 'listing' ? 'Create listing' : 'Place bid'}
        className={DRAWER}
      >
        {composer === 'listing' ? (
          <ListingForm availableKwh={availableKwh} onDone={() => setComposer(null)} />
        ) : composer === 'bid' ? (
          <BidForm suggestedKwh={Math.max(0.2, shortfallKwh)} onDone={() => setComposer(null)} />
        ) : null}
      </Inspector>

      <Inspector
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        eyebrow={selected?.side === 'SELL' ? 'Sell listing' : 'Buy bid'}
        title={selected ? displayName(selected.counterpartyId) : ''}
        className={DRAWER}
        footer={
          selected?.isMine && selected.status === 'OPEN' ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                const id = selected.id;
                setState((s) => ({
                  myListings: s.myListings.map((l) =>
                    l.id === id ? { ...l, status: 'WITHDRAWN' as const } : l,
                  ),
                  myBids: s.myBids.map((b) =>
                    b.id === id ? { ...b, status: 'WITHDRAWN' as const } : b,
                  ),
                }));
                setSelected(null);
              }}
            >
              Cancel order
            </Button>
          ) : null
        }
      >
        {selected ? <OrderDetail row={selected} clearingPricePaise={clearing} /> : null}
      </Inspector>
    </div>
  );
}

function OrderDetail({
  row,
  clearingPricePaise,
}: {
  row: BookRow;
  clearingPricePaise: number | null;
}) {
  const tariff = useTariff();
  const clears =
    clearingPricePaise == null
      ? null
      : row.side === 'SELL'
        ? row.pricePaise <= clearingPricePaise
        : row.pricePaise >= clearingPricePaise;
  const delivered = row.kwh * (1 - row.lossPct / 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Tag tone={row.side === 'SELL' ? 'solar' : 'mains'}>{row.side}</Tag>
        {clears != null ? (
          <Tag tone={clears ? 'up' : 'neutral'}>
            {clears ? 'Would clear' : row.side === 'SELL' ? 'Above clearing price' : 'Below clearing price'}
          </Tag>
        ) : null}
      </div>

      <dl>
        <DataRow label="Order">{row.id}</DataRow>
        <DataRow label={row.side === 'SELL' ? 'Seller' : 'Buyer'}>
          {fullName(row.counterpartyId)}
        </DataRow>
        <DataRow label="Connection">{row.nodeId}</DataRow>
        <DataRow label="Feeder">{row.feeder}</DataRow>
        <DataRow label="Substation">{substationOf(row.nodeId)}</DataRow>
      </dl>

      <div>
        <p className="text-label font-semibold uppercase text-ink-3">Delivery</p>
        <dl className="mt-1.5">
          <DataRow label="Energy">{kwh(row.kwh)} kWh</DataRow>
          <DataRow label="Distance from you">{km(row.distanceKm)}</DataRow>
          <DataRow label="Transmission loss" tone={row.lossPct > 2.5 ? 'warn' : 'neutral'}>
            {pct(row.lossPct)}
          </DataRow>
          <DataRow label="Delivered to you">{kwh(delivered)} kWh</DataRow>
        </dl>
      </div>

      <div>
        <p className="text-label font-semibold uppercase text-ink-3">Price</p>
        <dl className="mt-1.5">
          <DataRow label={row.side === 'SELL' ? 'Ask' : 'Limit'}>
            {rupees(row.pricePaise)}/kWh
          </DataRow>
          {clearingPricePaise != null ? (
            <DataRow label="Clearing price">{rupees(clearingPricePaise)}/kWh</DataRow>
          ) : null}
          {row.side === 'SELL' ? (
            <DataRow label="Cost to you at clearing">
              {rupees(Math.round(delivered * (clearingPricePaise ?? row.pricePaise)))}
            </DataRow>
          ) : (
            <DataRow label="You would receive">
              {rupees(
                Math.round(
                  delivered * ((clearingPricePaise ?? row.pricePaise) - tariff.wheelingChargePaise),
                ),
              )}
            </DataRow>
          )}
        </dl>
      </div>

      {row.byBroker ? (
        <p className="border-l-2 border-solar bg-solar-wash/40 px-3 py-2 text-xs text-ink-2">
          This listing was placed by your broker under an active policy. Cancelling it does not
          cancel the policy.
        </p>
      ) : null}

      {row.status !== 'OPEN' ? (
        <EmptyState title={`Order ${row.status.toLowerCase()}`}>
          This order is no longer in the book for the current slot.
        </EmptyState>
      ) : null}
    </div>
  );
}
