'use client';

import { useMemo, useState } from 'react';
import { PriceChart } from '@/components/charts/price-chart';
import { SolarDayChart } from '@/components/charts/solar-day-chart';
import { NodeInspector } from '@/components/mapview/node-inspector';
import { Inspector } from '@/components/ui/inspector';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { MeterBar, Tag } from '@/components/ui/tag';
import { ActivityFeed } from '@/components/broker/activity-feed';
import { congestionLevel, congestionTone, utilisation } from '@/lib/domain';
import { kwh, pct, rupees } from '@/lib/format';
import { priceSeries } from '@/lib/mock/market-engine';
import { displayName } from '@/lib/seed';
import { useStore } from '@/lib/store';
import { useDaySeries, useNetworkLedger, useTariff } from '@/hooks/use-derived';
import { useRoleSurface } from '@/hooks/use-role-surface';

/**
 * DISCOM operations.
 *
 * A distribution utility does not care who traded with whom; it cares whether
 * the wires can carry it and what the wheeling account looks like at the end
 * of the day. So this screen is organised by asset — feeder by feeder, with
 * capacity, headroom, matches carried and losses — the way a network operator
 * already reads their own system.
 */
export function DiscomView() {
  useRoleSurface('DISCOM');
  const topology = useStore((s) => s.topology);
  const readings = useStore((s) => s.readings);
  const history = useStore((s) => s.history);
  const market = useStore((s) => s.market);
  const simMinutes = useStore((s) => s.simMinutes);

  const network = useNetworkLedger();
  const tariff = useTariff();
  const series = useDaySeries(null);
  const [selected, setSelected] = useState<string | null>(null);

  const lastSlot = history[history.length - 1];

  const generation = readings.reduce((s, r) => s + r.generationKw, 0);
  const demand = readings.reduce((s, r) => s + r.consumptionKw, 0);

  const feeders = useMemo(
    () =>
      topology.nodes
        .filter((n) => n.kind === 'FEEDER')
        .map((f) => {
          const drop = topology.edges.find((e) => e.toNodeId === f.id);
          const u = drop ? utilisation(drop) : 0;
          const matches = (lastSlot?.match.pairs ?? []).filter((p) => p.pathNodeIds.includes(f.id));
          const carried = matches.reduce((s, p) => s + p.deliveredKwh, 0);
          const lost = matches.reduce((s, p) => s + p.lossKwh, 0);
          return {
            node: f,
            utilisation: u,
            available: Math.max(0, f.capacityKw - f.loadKw),
            matches: matches.length,
            carried,
            lossPct: carried + lost > 0 ? (lost / (carried + lost)) * 100 : 0,
            premises: topology.nodes.filter((n) => n.parentId === f.id).length,
          };
        })
        .sort((a, b) => b.utilisation - a.utilisation),
    [topology, lastSlot],
  );

  const substations = topology.nodes.filter((n) => n.kind === 'SUBSTATION');
  const worstLevel = feeders.length
    ? congestionLevel(Math.max(...feeders.map((f) => f.utilisation)))
    : 'NORMAL';

  const premiseColumns: Column<(typeof readings)[number]>[] = [
    {
      key: 'name',
      header: 'Premises',
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-ink">{r.name}</span>
          <span className="font-mono text-xs text-ink-3">
            {r.nodeId} · {r.meterId}
          </span>
        </span>
      ),
    },
    {
      key: 'gen',
      header: 'Generation',
      align: 'right',
      width: '96px',
      cell: (r) => (
        <Num unit="kW" tone={r.generationKw > 0 ? 'solar' : 'muted'}>
          {kwh(r.generationKw)}
        </Num>
      ),
    },
    {
      key: 'load',
      header: 'Load',
      align: 'right',
      width: '86px',
      cell: (r) => <Num unit="kW">{kwh(r.consumptionKw)}</Num>,
    },
    {
      key: 'net',
      header: 'Net',
      align: 'right',
      width: '92px',
      cell: (r) => (
        <Num unit="kW" tone={r.surplusKw >= 0 ? 'up' : 'down'}>
          {r.surplusKw >= 0 ? '+' : '−'}
          {kwh(Math.abs(r.surplusKw))}
        </Num>
      ),
    },
    {
      key: 'day',
      header: 'Generated today',
      align: 'right',
      width: '124px',
      hide: 'lg',
      cell: (r) => <Num tone="muted" unit="kWh">{kwh(r.dayGenerationKwh)}</Num>,
    },
    {
      key: 'panel',
      header: 'Rooftop',
      align: 'right',
      width: '84px',
      hide: 'xl',
      cell: (r) => (
        <Num tone="muted" unit="kW">
          {r.panelKw > 0 ? r.panelKw.toFixed(1) : '—'}
        </Num>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHead
        title="Sector 21 Distribution"
        subtitle="Network operations · 2 substations, 4 feeders, 12 metered premises, 85 unmetered connections"
        aside={
          <div className="flex items-center gap-2">
            <Tag tone={congestionTone(worstLevel)} dot>
              {worstLevel === 'NORMAL' ? 'All feeders within limits' : `${worstLevel} on one feeder`}
            </Tag>
          </div>
        }
      />

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric
              label="Local generation"
              value={kwh(generation)}
              unit="kW"
              tone="solar"
              hint="Metered rooftop output"
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Local demand"
              value={kwh(demand)}
              unit="kW"
              tone="mains"
              hint="Metered premises only"
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Traded today"
              value={kwh(network.deliveredKwh)}
              unit="kWh"
              hint={`${network.trades - network.failed} settled trades`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Wheeling revenue"
              value={rupees(network.wheelingPaise)}
              tone="up"
              hint={`${rupees(tariff.wheelingChargePaise)} per traded kWh`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Transmission loss"
              value={kwh(network.lossKwh)}
              unit="kWh"
              tone="warn"
              hint={`${pct(network.deliveredKwh > 0 ? (network.lossKwh / (network.deliveredKwh + network.lossKwh)) * 100 : 0)} of routed energy`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Grid backfill"
              value={kwh(network.backfillKwh)}
              unit="kWh"
              hint="Demand served from the grid"
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead title="Feeders" meta="Live capacity and matched flow" />
            <ul className="grid sm:grid-cols-2 hair-y sm:[&>*:nth-child(2n)]:border-l sm:[&>*:nth-child(2n)]:border-rule/[.13] sm:[&>*:nth-child(-n+2)]:border-t-0">
              {feeders.map((f) => {
                const level = congestionLevel(f.utilisation);
                return (
                  <li key={f.node.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(f.node.id)}
                      className="w-full px-3.5 py-3 text-left hover:bg-sunken/60"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-md font-medium tracking-[0.04em] text-ink">
                          {f.node.id.replace('F-', 'FEEDER 0')}
                        </span>
                        <span
                          className={`font-mono text-lg tabular-nums ${
                            level === 'CRITICAL'
                              ? 'text-down'
                              : level === 'HIGH'
                                ? 'text-warn'
                                : 'text-ink'
                          }`}
                        >
                          {pct(f.utilisation * 100, 0)}
                        </span>
                      </div>
                      <MeterBar
                        value={f.utilisation}
                        tone={congestionTone(level)}
                        className="mt-2"
                        ariaLabel={`${f.node.id} utilisation`}
                      />
                      <dl className="mt-2 space-y-0.5 text-xs text-ink-2">
                        <div className="flex justify-between gap-3">
                          <dt>Available</dt>
                          <dd className="font-mono tabular-nums">{kwh(f.available)} kW</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Active matches</dt>
                          <dd className="font-mono tabular-nums">{f.matches}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Transmission loss</dt>
                          <dd className="font-mono tabular-nums">{pct(f.lossPct)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Premises</dt>
                          <dd className="font-mono tabular-nums">{f.premises} metered</dd>
                        </div>
                      </dl>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel>
            <PanelHead title="Metered premises" meta="Live readings" />
            <DataTable
              columns={premiseColumns}
              rows={readings}
              rowKey={(r) => r.nodeId}
              onRowClick={(r) => setSelected(r.nodeId)}
              selectedKey={selected}
              dense
              maxHeight={340}
              caption="Metered premises on the Sector 21 network"
            />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead title="Network load profile" meta="All metered premises" />
              <PanelBody>
                <SolarDayChart data={series} nowMinute={simMinutes} height={186} />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHead title="Clearing price" meta={`${history.length} slots`} />
              <PanelBody>
                <PriceChart data={priceSeries(history)} tariff={tariff} height={186} />
              </PanelBody>
            </Panel>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {selected ? (
            <Inspector
              open
              onClose={() => setSelected(null)}
              eyebrow="Asset"
              title={topology.nodes.find((n) => n.id === selected)?.name ?? selected}
            >
              <NodeInspector
                nodeId={selected}
                topology={topology}
                readings={readings}
                history={history}
              />
            </Inspector>
          ) : (
            <Panel>
              <PanelHead title="Substations" />
              <ul className="hair-y">
                {substations.map((s) => {
                  const u = s.capacityKw > 0 ? Math.max(0, s.loadKw) / s.capacityKw : 0;
                  const level = congestionLevel(u);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(s.id)}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-sunken/60"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-sm text-ink">{s.name}</span>
                          <Tag tone={congestionTone(level)}>{pct(u * 100, 0)}</Tag>
                        </div>
                        <MeterBar value={u} tone={congestionTone(level)} className="mt-1.5" />
                        <div className="mt-1 flex justify-between text-xs text-ink-3">
                          <span>
                            {kwh(s.loadKw)} / {s.capacityKw} kW
                          </span>
                          <span>{kwh(Math.max(0, s.capacityKw - s.loadKw))} kW free</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          <Panel>
            <PanelHead title="Wheeling account" meta="Today" />
            <PanelBody>
              <dl>
                <DataRow label="Traded energy">{kwh(network.deliveredKwh)} kWh</DataRow>
                <DataRow label="Rate">{rupees(tariff.wheelingChargePaise)}/kWh</DataRow>
                <DataRow label="Collected" tone="up">
                  {rupees(network.wheelingPaise)}
                </DataRow>
                <DataRow label="Slots settled">{network.slots}</DataRow>
                <DataRow label="Failed settlements" tone={network.failed > 0 ? 'down' : 'neutral'}>
                  {network.failed}
                </DataRow>
                <DataRow label="Community allocation">{kwh(network.donatedKwh)} kWh</DataRow>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-2">
                Every traded unit crosses the distribution network and is charged for it. Local
                trading reduces the energy the DISCOM must buy and transmit while keeping the
                wheeling account whole.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Network activity" />
            <ActivityFeed
              channels={['match', 'settlement', 'community', 'system']}
              maxHeight={260}
              emptyNote="No network events yet in this session."
            />
          </Panel>

          <Panel>
            <PanelHead title="Current slot" meta={market?.slotId.slice(11) ?? '—'} />
            <PanelBody>
              <dl>
                <DataRow label="Supply offered">{kwh(market?.totalSupplyKwh ?? 0)} kWh</DataRow>
                <DataRow label="Demand bid">{kwh(market?.totalDemandKwh ?? 0)} kWh</DataRow>
                <DataRow label="Indicative price">
                  {rupees(market?.indicativePricePaise ?? 0)}/kWh
                </DataRow>
                <DataRow label="Congestion index">
                  {pct((market?.congestionIndex ?? 0) * 100, 0)}
                </DataRow>
                <DataRow label="Matches last slot">{lastSlot?.match.pairs.length ?? 0}</DataRow>
                <DataRow label="Largest counterparty" mono={false}>
                  {lastSlot?.match.pairs[0] ? displayName(lastSlot.match.pairs[0].sellerId) : '—'}
                </DataRow>
              </dl>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
