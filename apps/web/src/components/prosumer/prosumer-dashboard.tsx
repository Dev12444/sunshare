'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TradeRecord } from '@sunshare/shared';
import { SolarDayChart, SurplusStrip } from '@/components/charts/solar-day-chart';
import { PriceChart } from '@/components/charts/price-chart';
import { CorridorNote, MarketSummary } from '@/components/market/market-summary';
import { MarketStatus } from '@/components/market/market-status';
import { LifecycleBand, type StageValue } from '@/components/ui/lifecycle-band';
import type { LifecycleStage } from '@/components/ui/lifecycle-rail';
import { ListingForm } from '@/components/market/order-forms';
import { TradeReceipt } from '@/components/market/trade-receipt';
import { TradeTable } from '@/components/market/trade-table';
import { Button, SegmentedControl } from '@/components/ui/controls';
import { DRAWER, Inspector } from '@/components/ui/inspector';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { Panel, PanelBody, PanelHead, PageHead } from '@/components/ui/panel';
import { EmptyState, MetricSkeleton } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { objectiveLabel } from '@/lib/mock/broker';
import { priceSeries } from '@/lib/mock/market-engine';
import { kgCo2, kwh, rupees, simClock } from '@/lib/format';
import { feederOf, fullName, substationOf } from '@/lib/seed';
import { allReceipts, setState, useStore } from '@/lib/store';
import { useDayLedger, useDaySeries, useMyReading, useTariff } from '@/hooks/use-derived';
import { useRoleSurface } from '@/hooks/use-role-surface';
import { InstallPrompt } from '@/components/shell/install-prompt';
import { HeroBanner } from './hero-banner';

/**
 * Prosumer overview.
 *
 * The reading order is deliberate: what my roof is doing right now, what that
 * is worth in this market, what I have already earned today, and only then the
 * controls. A household opens this app to answer "should I be selling" — the
 * top strip answers it without scrolling.
 */
export function ProsumerDashboard() {
  useRoleSurface('PROSUMER');
  const user = useStore((s) => s.user);
  const market = useStore((s) => s.market);
  const history = useStore((s) => s.history);
  const simMinutes = useStore((s) => s.simMinutes);
  const myListings = useStore((s) => s.myListings);
  const policy = useStore((s) => s.policy);
  const brokerPaused = useStore((s) => s.brokerPaused);
  const receipts = useStore(allReceipts);

  const reading = useMyReading();
  const ledger = useDayLedger();
  const tariff = useTariff();
  const series = useDaySeries(user.id);

  const [chart, setChart] = useState<'day' | 'surplus'>('day');
  const [listingOpen, setListingOpen] = useState(false);
  const [selected, setSelected] = useState<TradeRecord | null>(null);

  const activeListing = myListings.find(
    (l) => l.status === 'OPEN' && l.slotId === market?.slotId,
  );
  const surplusKw = reading?.surplusKw ?? 0;
  const remainingHours = market ? (15 - (simMinutes % 15)) / 60 : 0;
  const availableKwh = Math.max(0, surplusKw) * Math.max(remainingHours, 0.05);
  const price = market?.lastClearingPricePaise ?? market?.indicativePricePaise ?? 0;

  /* ----------------------------------------------------- derived for panels */

  /** The live slot has not cleared, so volume can only come from the last one. */
  const lastVolumeKwh = history.length > 0 ? history[history.length - 1].volumeKwh : null;

  /** My trades in the current slot — what "matched" and "settled" mean to me. */
  const slotTrades = ledger.trades.filter((t) => t.slotId === market?.slotId);
  const settledInSlot = slotTrades.filter((t) => t.status === 'SETTLED');

  /**
   * Where this household actually is in the lifecycle. Read backwards from the
   * furthest thing that has happened: settled beats matched, matched beats
   * listed, and with nothing listed you are still deciding whether to.
   */
  const lifecycleStage: LifecycleStage =
    settledInSlot.length > 0
      ? 'IMPACT'
      : slotTrades.length > 0
        ? 'SETTLE'
        : activeListing
          ? 'MARKET'
          : availableKwh >= 0.05
            ? 'SURPLUS'
            : 'GENERATE';

  /**
   * Left three stages are instantaneous, right three are cumulative for the
   * day, and each unit says which. Scoping match/settle to the *open* slot was
   * the first cut and it showed an em dash almost always — the current slot has
   * by definition not cleared yet, so the band read as empty on a day with
   * seventeen completed trades behind it.
   */
  const lifecycleValues: Partial<Record<LifecycleStage, StageValue>> = {
    GENERATE: { value: reading ? kwh(reading.generationKw) : null, unit: 'kW now' },
    SURPLUS: { value: surplusKw > 0 ? kwh(surplusKw) : null, unit: 'kW now' },
    MARKET: { value: market ? rupees(price) : null, unit: '/kWh' },
    MATCH: {
      value: ledger.trades.length > 0 ? String(ledger.trades.length) : null,
      unit: ledger.trades.length === 1 ? 'trade today' : 'trades today',
    },
    SETTLE: {
      value: ledger.revenuePaise > 0 ? rupees(ledger.revenuePaise) : null,
      unit: 'today',
    },
    IMPACT: { value: ledger.co2Kg > 0 ? kgCo2(ledger.co2Kg) : null, unit: 'today' },
  };

  return (
    <div className="space-y-4">
      {/* The reference opens on a solar band before any figure. It earns the
          space by carrying the greeting, the simulated clock and live output —
          the three things you check before deciding whether to read on. */}
      <HeroBanner
        name={fullName(user.id)}
        subtitle={
          reading
            ? `${reading.panelKw} kW rooftop · ${feederOf(reading.nodeId)} · ${substationOf(reading.nodeId)}`
            : 'Rooftop premises'
        }
      />

      <PageHead
        stage="GENERATE"
        title={fullName(user.id)}
        subtitle={
          reading
            ? `${reading.panelKw} kW rooftop · ${feederOf(reading.nodeId)} · ${substationOf(reading.nodeId)}`
            : 'Rooftop premises'
        }
        aside={
          <Button
            variant="primary"
            onClick={() => setListingOpen(true)}
            disabled={availableKwh < 0.05}
            title={availableKwh < 0.05 ? 'No surplus available in this slot' : undefined}
          >
            Create listing
          </Button>
        }
      />

      {/* Live premises state. One panel, hairline cells — not six floating tiles. */}
      <Panel>
        <MetricRow>
          {reading ? (
            <>
              <MetricCell>
                <Metric
                  label="Generation"
                  value={kwh(reading.generationKw)}
                  unit="kW"
                  tone="solar"
                  hint={`${kwh(reading.dayGenerationKwh)} kWh today`}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Consumption"
                  value={kwh(reading.consumptionKw)}
                  unit="kW"
                  tone="mains"
                  hint="Household load"
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Surplus"
                  value={kwh(Math.abs(surplusKw))}
                  unit="kW"
                  tone={surplusKw >= 0 ? 'up' : 'down'}
                  hint={surplusKw >= 0 ? `${kwh(availableKwh)} kWh this slot` : 'Importing'}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Sold today"
                  value={kwh(ledger.soldDeliveredKwh)}
                  unit="kWh"
                  hint={`${ledger.trades.filter((t) => t.sellerId === user.id).length} trades`}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Revenue today"
                  value={rupees(ledger.revenuePaise)}
                  tone="up"
                  hint={`After ${rupees(ledger.wheelingPaise)} wheeling`}
                />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="CO₂ avoided"
                  value={kgCo2(ledger.co2Kg)}
                  hint="Versus grid supply"
                />
              </MetricCell>
            </>
          ) : (
            ['Generation', 'Consumption', 'Surplus', 'Sold today', 'Revenue today', 'CO₂ avoided'].map(
              (l) => <MetricSkeleton key={l} label={l} />,
            )
          )}
        </MetricRow>
      </Panel>

      {/* The lifecycle, with what each stage is actually worth right now. */}
      <Panel>
        <PanelHead title="Energy lifecycle" meta="Live premises state" />
        <LifecycleBand current={lifecycleStage} values={lifecycleValues} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead
              title="Solar day"
              meta="06:00 – 23:45 · 10-minute resolution"
              actions={
                <SegmentedControl
                  size="sm"
                  label="Chart view"
                  value={chart}
                  onChange={setChart}
                  options={[
                    { value: 'day', label: 'Generation' },
                    { value: 'surplus', label: 'Surplus' },
                  ]}
                />
              }
            />
            <PanelBody>
              {series.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-3">
                  Waiting for meter history from the engine.
                </p>
              ) : chart === 'day' ? (
                <SolarDayChart data={series} nowMinute={simMinutes} height={248} />
              ) : (
                <SurplusStrip data={series} nowMinute={simMinutes} height={248} />
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead
              title="Recent trades"
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
                <EmptyState title="No trades yet today">
                  Your first trade appears here the moment a slot clears with your listing in it.
                </EmptyState>
              }
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead
              title="Market status"
              meta={market ? (market.lastClearingPricePaise !== null ? 'Cleared' : 'Open') : undefined}
            />
            {market ? (
              <MarketStatus market={market} tariff={tariff} lastVolumeKwh={lastVolumeKwh} />
            ) : (
              <MarketSummary market={market} tariff={tariff} />
            )}
          </Panel>

          <Panel>
            <PanelHead title="Active listing" />
            {activeListing ? (
              <PanelBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <Tag tone="solar" dot>
                    Open
                  </Tag>
                  {activeListing.brokerPolicyId ? (
                    <span className="text-xs text-ink-3">Placed by broker</span>
                  ) : null}
                </div>
                <dl>
                  <DataRow label="Energy">{kwh(activeListing.kwh)} kWh</DataRow>
                  <DataRow label="Ask">{rupees(activeListing.askPricePaise)}/kWh</DataRow>
                  <DataRow label="Expires">{simClock(activeListing.expiresAtSim)}</DataRow>
                  <DataRow label="Net if filled" tone="up">
                    {rupees(
                      Math.round(
                        activeListing.kwh *
                          (activeListing.askPricePaise - tariff.wheelingChargePaise),
                      ),
                    )}
                  </DataRow>
                </dl>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      setState((s) => ({
                        myListings: s.myListings.map((l) =>
                          l.id === activeListing.id ? { ...l, status: 'WITHDRAWN' as const } : l,
                        ),
                      }))
                    }
                  >
                    Cancel listing
                  </Button>
                  <Button size="sm" onClick={() => setListingOpen(true)}>
                    Replace
                  </Button>
                </div>
              </PanelBody>
            ) : (
              <EmptyState
                title="No active listing"
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={availableKwh < 0.05}
                    onClick={() => setListingOpen(true)}
                  >
                    Create listing
                  </Button>
                }
              >
                You have{' '}
                <span className="font-mono tabular-nums text-ink">{kwh(availableKwh)} kWh</span> of
                estimated surplus in this slot. Offer it to nearby consumers when you are ready, or
                let the broker decide.
              </EmptyState>
            )}
          </Panel>

          <Panel>
            <PanelHead
              title="Broker policy"
              actions={
                <Link
                  href="/broker"
                  className="rounded-sm px-1.5 py-1 text-xs text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  Open
                </Link>
              }
            />
            {policy ? (
              <PanelBody className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Tag tone={brokerPaused ? 'neutral' : 'up'} dot>
                    {brokerPaused ? 'Paused' : 'Active'}
                  </Tag>
                  <span className="text-xs text-ink-3">{objectiveLabel(policy.objective)}</span>
                </div>
                <p className="text-sm italic text-ink-2">“{policy.rawGoal}”</p>
                <dl>
                  <DataRow label="Minimum price">{rupees(policy.minPricePaise)}/kWh</DataRow>
                  <DataRow label="Reserve">{policy.reserveKwh} kWh</DataRow>
                  <DataRow label="Valid until">{simClock(policy.validUntilSim)}</DataRow>
                </dl>
              </PanelBody>
            ) : (
              <EmptyState
                title="No broker policy"
                action={
                  <Link
                    href="/broker"
                    className="inline-flex h-7 items-center rounded-sm border border-rule/25 bg-surface px-2.5 text-xs font-medium hover:bg-sunken"
                  >
                    Set a goal
                  </Link>
                }
              >
                Describe what you want in plain language and the broker turns it into a constrained
                policy. It never signs a transaction itself.
              </EmptyState>
            )}
          </Panel>

          <Panel>
            <PanelHead title="Community contribution" />
            <PanelBody className="space-y-2">
              <Metric
                label="Allocated today"
                value={kwh(ledger.donatedKwh)}
                unit="kWh"
                size="sm"
              />
              {ledger.donations.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {ledger.donations.slice(0, 3).map((d) => (
                    <li key={d.id} className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-ink-2">{d.beneficiaryName}</span>
                      <span className="shrink-0 font-mono tabular-nums text-ink-3">
                        {kwh(d.kwh)} kWh
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-3">
                  Nothing routed to the pool today. Configure a share on the{' '}
                  <Link href="/community" className="underline underline-offset-2">
                    community page
                  </Link>
                  .
                </p>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHead
          title="Clearing price"
          meta={`${history.length} slots cleared today`}
          actions={
            <span className="font-mono text-xs tabular-nums text-ink-3">{rupees(price)}/kWh</span>
          }
        />
        <PanelBody>
          <PriceChart data={priceSeries(history)} tariff={tariff} height={176} />
          <div className="mt-3 border-t border-rule/[.13] pt-3">
            <CorridorNote tariff={tariff} />
          </div>
        </PanelBody>
      </Panel>

      <InstallPrompt />

      <Inspector
        open={listingOpen}
        onClose={() => setListingOpen(false)}
        eyebrow="Sell"
        title="Create listing"
        className={DRAWER}
      >
        <ListingForm availableKwh={availableKwh} onDone={() => setListingOpen(false)} />
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
    </div>
  );
}
