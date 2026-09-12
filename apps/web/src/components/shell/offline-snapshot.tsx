'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_TARIFF, type MarketState, type MeterReading } from '@sunshare/shared';
import { PriceCorridor } from '@/components/market/corridor';
import { Button } from '@/components/ui/controls';
import { Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/states';
import { kwh, rupees, simClock, slotRange } from '@/lib/format';
import { displayName } from '@/lib/seed';
import { loadSnapshot } from '@/lib/offline-store';
import { BrandMark, Wordmark } from './brand';

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; market: MarketState; meters: MeterReading[]; savedAt: string };

export function OfflineSnapshot() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [online, setOnline] = useState(true);

  useEffect(() => {
    void loadSnapshot().then((snap) =>
      setState(
        snap
          ? { status: 'ready', market: snap.market, meters: snap.meters, savedAt: snap.savedAt }
          : { status: 'empty' },
      ),
    );
  }, []);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6">
      <header className="flex items-center justify-between gap-3 border-b border-rule/[.13] pb-3">
        <div className="flex items-center gap-2">
          <BrandMark />
          <Wordmark className="text-md" />
        </div>
        <span className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-up' : 'bg-ink-3'}`} />
          {online ? 'Connection restored' : 'Offline'}
        </span>
      </header>

      {state.status === 'loading' ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : state.status === 'empty' ? (
        <div className="mt-6 border-l-2 border-warn bg-sunken px-4 py-3">
          <p className="text-label font-semibold uppercase text-ink-2">No cached market data</p>
          <p className="mt-1.5 max-w-[52ch] text-sm text-ink-2">
            This device has not received a market frame yet, so there is nothing to show offline.
            Open SunShare once while connected and the last state is kept here for next time.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-2 border-ink-3 bg-sunken px-3.5 py-2">
            <span className="text-label font-semibold uppercase text-ink-2">Offline</span>
            <span className="min-w-0 flex-1 text-sm text-ink-2">
              Showing market data from{' '}
              <span className="font-mono tabular-nums text-ink">
                {simClock(state.market.slotStartSim)}
              </span>
              . Live trading resumes automatically when you reconnect.
            </span>
          </div>

          <Panel className="mt-4">
            <MetricRow>
              <MetricCell>
                <Metric
                  label="Last clearing price"
                  value={rupees(
                    state.market.lastClearingPricePaise ?? state.market.indicativePricePaise,
                  )}
                  unit="/kWh"
                  tone="solar"
                  size="lg"
                  hint={`Slot ${slotRange(state.market.slotId)}`}
                />
              </MetricCell>
              <MetricCell>
                <Metric label="Supply offered" value={kwh(state.market.totalSupplyKwh)} unit="kWh" />
              </MetricCell>
              <MetricCell>
                <Metric label="Demand bid" value={kwh(state.market.totalDemandKwh)} unit="kWh" />
              </MetricCell>
              <MetricCell>
                <Metric
                  label="Open orders"
                  value={`${state.market.activeListings} / ${state.market.activeBids}`}
                  hint="Listings / bids"
                />
              </MetricCell>
            </MetricRow>
            <PanelBody className="border-t border-rule/[.13]">
              <PriceCorridor
                tariff={DEFAULT_TARIFF}
                clearingPricePaise={state.market.lastClearingPricePaise}
                indicativePricePaise={state.market.indicativePricePaise}
              />
            </PanelBody>
          </Panel>

          <Panel className="mt-4">
            <PanelHead title="Last meter readings" meta={`${state.meters.length} premises`} />
            <ul className="hair-y">
              {state.meters.slice(0, 8).map((m) => (
                <li key={m.meterId} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <span className="truncate text-sm text-ink">{displayName(m.userId)}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-ink-2">
                    {m.surplusKw >= 0 ? '+' : '−'}
                    {kwh(Math.abs(m.surplusKw))}
                    <span className="ml-1 font-sans text-micro text-ink-3">kW</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Retry connection
        </Button>
        <Link
          href="/prosumer"
          className="inline-flex h-[34px] items-center rounded-sm border border-rule/25 bg-surface px-3 text-sm font-medium hover:bg-sunken"
        >
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
