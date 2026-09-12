'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Inspector } from '@/components/ui/inspector';
import { Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/states';
import { MeterBar, Tag } from '@/components/ui/tag';
import { congestionLevel, congestionTone, utilisation } from '@/lib/domain';
import { kwh, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { FlowPath, MapFilters } from './energy-map';
import { NodeInspector } from './node-inspector';

const EnergyMap = dynamic(() => import('./energy-map').then((m) => m.EnergyMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * Geographic view of the network.
 *
 * The map answers "where", the grid view answers "how it is wired". Both share
 * the node inspector, so a node clicked here and the same node clicked there
 * tell the same story.
 */
export function MapView() {
  const topology = useStore((s) => s.topology);
  const readings = useStore((s) => s.readings);
  const history = useStore((s) => s.history);
  const market = useStore((s) => s.market);

  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<MapFilters>({
    producers: true,
    consumers: true,
    flows: true,
    congestion: true,
    topology: true,
  });

  const flows: FlowPath[] = useMemo(() => {
    const last = history[history.length - 1];
    if (!last) return [];
    return last.match.pairs.map((p, i) => ({
      id: `${last.slotId}-${i}`,
      nodeIds: p.pathNodeIds,
      kwh: p.deliveredKwh,
    }));
  }, [history]);

  const worst = useMemo(() => {
    const ranked = topology.edges
      .map((e) => ({ edge: e, u: utilisation(e) }))
      .sort((a, b) => b.u - a.u);
    return ranked.slice(0, 4);
  }, [topology.edges]);

  const exporting = readings.filter((r) => r.surplusKw > 0.02);
  const importing = readings.filter((r) => r.surplusKw <= 0.02);
  const totalSurplus = exporting.reduce((s, r) => s + r.surplusKw, 0);
  const totalDeficit = importing.reduce((s, r) => s + Math.abs(r.surplusKw), 0);

  return (
    <div className="space-y-4">
      <PageHead
        title="Energy Map"
        subtitle="Sector 21, Gandhinagar · 12 metered premises across 4 feeders and 2 substations"
        aside={
          market ? (
            <span className="text-xs text-ink-3">
              Flow shown for slot{' '}
              <span className="font-mono tabular-nums text-ink-2">
                {history[history.length - 1]?.slotId.slice(11) ?? '—'}
              </span>
            </span>
          ) : null
        }
      />

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric
              label="Exporting"
              value={String(exporting.length)}
              unit="premises"
              tone="solar"
              hint={`${kwh(totalSurplus)} kW surplus`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Importing"
              value={String(importing.length)}
              unit="premises"
              tone="mains"
              hint={`${kwh(totalDeficit)} kW draw`}
            />
          </MetricCell>
          <MetricCell>
            <Metric label="Active flows" value={String(flows.length)} unit="paths" hint="Last cleared slot" />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Network congestion"
              value={pct((market?.congestionIndex ?? 0) * 100, 0)}
              tone={(market?.congestionIndex ?? 0) > 0.75 ? 'down' : 'neutral'}
              hint="Weighted to the worst span"
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule/[.13] px-3.5 py-2">
            <span className="text-label font-semibold uppercase text-ink-2">Network</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {(
                [
                  ['producers', 'Producers'],
                  ['consumers', 'Consumers'],
                  ['flows', 'Active trades'],
                  ['congestion', 'Congestion'],
                  ['topology', 'Grid topology'],
                ] as [keyof MapFilters, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-ink-2"
                >
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
                    className="h-3 w-3 accent-[rgb(var(--solar))]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="h-[clamp(320px,58dvh,620px)]">
            <EnergyMap
              topology={topology}
              readings={readings}
              flows={flows}
              filters={filters}
              selectedNodeId={selected}
              onSelectNode={setSelected}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule/[.13] px-3.5 py-2 text-xs text-ink-3">
            <Key colour="rgb(var(--solar))" filled>
              Exporting premises
            </Key>
            <Key colour="rgb(var(--mains))">Importing premises</Key>
            <Key colour="rgb(var(--up))" line>
              Span below 75%
            </Key>
            <Key colour="rgb(var(--warn))" line>
              75–95%
            </Key>
            <Key colour="rgb(var(--down))" line>
              Above 95%
            </Key>
            <span>Marker size follows the magnitude of flow.</span>
          </div>
        </Panel>

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
                  Select a premise, feeder or substation on the map to see its generation, load,
                  capacity, utilisation and connected trades.
                </p>
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHead title="Most loaded spans" meta="Live utilisation" />
            <ul className="hair-y">
              {worst.map(({ edge, u }) => {
                const level = congestionLevel(u);
                return (
                  <li key={edge.id} className="px-3.5 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-sm text-ink">{edge.id}</span>
                      <Tag tone={congestionTone(level)}>{pct(u * 100, 0)}</Tag>
                    </div>
                    <MeterBar value={u} tone={congestionTone(level)} className="mt-1.5" />
                    <div className="mt-1 flex justify-between text-xs text-ink-3">
                      <span>
                        {kwh(edge.currentLoadKw)} / {edge.capacityKw} kW
                      </span>
                      <span>{kwh(Math.max(0, edge.capacityKw - edge.currentLoadKw))} kW free</span>
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

function Key({
  colour,
  filled,
  line,
  children,
}: {
  colour: string;
  filled?: boolean;
  line?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={line ? 'inline-block h-[2px] w-4' : 'inline-block h-2.5 w-2.5 rounded-full border'}
        style={
          line
            ? { background: colour }
            : { borderColor: colour, background: filled ? colour : 'transparent', opacity: filled ? 0.7 : 1 }
        }
      />
      {children}
    </span>
  );
}
