'use client';

import { useMemo, useState } from 'react';
import { Button, SegmentedControl } from '@/components/ui/controls';
import { Inspector } from '@/components/ui/inspector';
import { Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { MeterBar, Tag } from '@/components/ui/tag';
import { NodeInspector } from '@/components/mapview/node-inspector';
import { congestionLevel, congestionTone, utilisation } from '@/lib/domain';
import { km, kwh, pct } from '@/lib/format';
import { NODE_BY_ID } from '@/lib/seed';
import { useStore } from '@/lib/store';
import { toggleCongestion } from '@/lib/transport';
import { GridDiagram } from './grid-diagram';

type Scope = 'all' | 'loaded' | 'congested';

/**
 * Network view.
 *
 * Schematic on top, span table below, inspector alongside. This is the screen
 * an operator uses to answer "can this feeder take another 3 kW", so capacity
 * and headroom are columns, not tooltips.
 */
/** The service drop feeding H-01 — the same line the engine's congestion beat fills. */
const DEMO_CONGESTED_EDGE = 'e-F-1-H-01';

export function GridView() {
  const topology = useStore((s) => s.topology);
  const readings = useStore((s) => s.readings);
  const history = useStore((s) => s.history);
  const market = useStore((s) => s.market);
  const stressed = useStore((s) => s.stressedEdges);
  const mocked = useStore((s) => s.mocked);

  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');

  const spans = useMemo(() => {
    const rows = topology.edges.map((e) => ({ edge: e, u: utilisation(e) }));
    const filtered =
      scope === 'congested'
        ? rows.filter((r) => congestionLevel(r.u) !== 'NORMAL')
        : scope === 'loaded'
          ? rows.filter((r) => r.u >= 0.4)
          : rows;
    return filtered.sort((a, b) => b.u - a.u);
  }, [topology.edges, scope]);

  const activePaths = useMemo(() => {
    const last = history[history.length - 1];
    return last ? last.match.pairs.map((p) => p.pathNodeIds) : [];
  }, [history]);

  const totals = useMemo(() => {
    const feeders = topology.nodes.filter((n) => n.kind === 'FEEDER');
    const load = feeders.reduce((s, f) => s + Math.max(0, f.loadKw), 0);
    const capacity = feeders.reduce((s, f) => s + f.capacityKw, 0);
    const congested = topology.edges.filter((e) => congestionLevel(utilisation(e)) !== 'NORMAL');
    const last = history[history.length - 1];
    return {
      load,
      capacity,
      congested: congested.length,
      lossKwh: last?.match.totalLossKwh ?? 0,
      lossPct: last ? 100 - last.match.avgEfficiencyPct : 0,
      flows: last?.match.pairs.length ?? 0,
    };
  }, [topology, history]);

  const columns: Column<{ edge: (typeof spans)[number]['edge']; u: number }>[] = [
    {
      key: 'span',
      header: 'Span',
      cell: ({ edge }) => <Num className="text-ink">{edge.id.replace(/^e-/, '')}</Num>,
    },
    {
      key: 'from',
      header: 'From → to',
      hide: 'md',
      cell: ({ edge }) => (
        <span className="text-sm text-ink-2">
          {NODE_BY_ID.get(edge.fromNodeId)?.name ?? edge.fromNodeId} →{' '}
          {NODE_BY_ID.get(edge.toNodeId)?.name ?? edge.toNodeId}
        </span>
      ),
    },
    {
      key: 'length',
      header: 'Length',
      align: 'right',
      width: '76px',
      hide: 'lg',
      cell: ({ edge }) => <Num tone="muted">{km(edge.lengthKm)}</Num>,
    },
    {
      key: 'load',
      header: 'Load',
      align: 'right',
      width: '92px',
      cell: ({ edge }) => (
        <Num unit="kW">{kwh(edge.currentLoadKw)}</Num>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      align: 'right',
      width: '86px',
      hide: 'sm',
      cell: ({ edge }) => <Num tone="muted" unit="kW">{edge.capacityKw}</Num>,
    },
    {
      key: 'headroom',
      header: 'Free',
      align: 'right',
      width: '86px',
      hide: 'lg',
      cell: ({ edge }) => (
        <Num tone="muted" unit="kW">
          {kwh(Math.max(0, edge.capacityKw - edge.currentLoadKw))}
        </Num>
      ),
    },
    {
      key: 'utilisation',
      header: 'Utilisation',
      align: 'right',
      width: '140px',
      cell: ({ u }) => {
        const level = congestionLevel(u);
        return (
          <div className="flex items-center justify-end gap-2">
            <MeterBar value={u} tone={congestionTone(level)} className="w-16" />
            <Num tone={level === 'CRITICAL' ? 'down' : level === 'HIGH' ? undefined : 'muted'}>
              {pct(u * 100, 0)}
            </Num>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHead
        title="Grid"
        subtitle="Radial distribution network · 2 substations, 4 feeders, 12 metered premises"
        aside={
          mocked ? (
            <Button
              size="sm"
              variant={stressed.length ? 'danger' : 'default'}
              onClick={() => toggleCongestion(DEMO_CONGESTED_EDGE)}
              title="Fill the Patel Residence service line to near capacity; its trades re-route to the next clear path"
            >
              {stressed.length ? 'Clear congestion' : 'Congest H-01 line'}
            </Button>
          ) : null
        }
      />

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric
              label="Network load"
              value={kwh(totals.load)}
              unit="kW"
              hint={`of ${totals.capacity} kW feeder capacity`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Congestion index"
              value={pct((market?.congestionIndex ?? 0) * 100, 0)}
              tone={(market?.congestionIndex ?? 0) > 0.75 ? 'down' : 'neutral'}
              hint="Weighted to the worst span"
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Congested spans"
              value={String(totals.congested)}
              unit={`of ${topology.edges.length}`}
              tone={totals.congested > 0 ? 'warn' : 'up'}
              hint="Above 75% utilisation"
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Transmission loss"
              value={kwh(totals.lossKwh)}
              unit="kWh"
              tone="warn"
              hint={`${pct(totals.lossPct)} of last slot`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Active flows"
              value={String(totals.flows)}
              unit="paths"
              hint="Matched in the last slot"
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead
              title="Single-line diagram"
              meta="Colour follows span utilisation"
              actions={
                <span className="hidden text-xs text-ink-3 sm:inline">
                  Select any element to inspect
                </span>
              }
            />
            <PanelBody className="px-2 py-2 sm:px-3.5">
              <GridDiagram
                topology={topology}
                readings={readings}
                selectedNodeId={selected}
                onSelectNode={setSelected}
                activePathNodeIds={activePaths}
              />
            </PanelBody>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule/[.13] px-3.5 py-2 text-xs text-ink-3">
              <Legend colour="rgb(var(--up))">Below 75%</Legend>
              <Legend colour="rgb(var(--warn))">75–95%</Legend>
              <Legend colour="rgb(var(--down))">Above 95%</Legend>
              <Legend colour="rgb(var(--solar))">Carrying a matched trade</Legend>
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/[.13] px-3.5 py-2">
              <span className="text-label font-semibold uppercase text-ink-2">Spans</span>
              <SegmentedControl
                size="sm"
                label="Span filter"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'loaded', label: 'Loaded' },
                  { value: 'congested', label: 'Congested' },
                ]}
              />
            </div>
            <DataTable
              columns={columns}
              rows={spans}
              rowKey={({ edge }) => edge.id}
              onRowClick={({ edge }) => setSelected(edge.toNodeId)}
              selectedKey={spans.find(({ edge }) => edge.toNodeId === selected)?.edge.id ?? null}
              dense
              maxHeight={340}
              caption="Distribution spans with live load and capacity"
              empty={
                <div className="px-4 py-8 text-center text-sm text-ink-3">
                  No span is above 75% utilisation. The network has headroom on every conductor.
                </div>
              }
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {selected ? (
            <Inspector
              open
              onClose={() => setSelected(null)}
              eyebrow="Node"
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
              <PanelHead title="Inspector" />
              <PanelBody>
                <p className="text-sm text-ink-3">
                  Select a busbar, feeder or premise in the diagram, or a row in the span table.
                </p>
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHead title="Feeders" meta="Live" />
            <ul className="hair-y">
              {topology.nodes
                .filter((n) => n.kind === 'FEEDER')
                .map((f) => {
                  const drop = topology.edges.find((e) => e.toNodeId === f.id);
                  const u = drop ? utilisation(drop) : 0;
                  const level = congestionLevel(u);
                  const matches = (history[history.length - 1]?.match.pairs ?? []).filter((p) =>
                    p.pathNodeIds.includes(f.id),
                  );
                  return (
                    <li key={f.id} className="px-3.5 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm font-medium text-ink">
                          {f.id.replace('F-', 'FEEDER 0')}
                        </span>
                        <Tag tone={congestionTone(level)}>{pct(u * 100, 0)}</Tag>
                      </div>
                      <MeterBar value={u} tone={congestionTone(level)} className="mt-1.5" />
                      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-ink-3">
                        <span>
                          {kwh(Math.max(0, f.capacityKw - f.loadKw))} kW available
                        </span>
                        <span>{matches.length} active matches</span>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Legend({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-[2px] w-4" style={{ background: colour }} />
      {children}
    </span>
  );
}
