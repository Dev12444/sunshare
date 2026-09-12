'use client';

import type { GridTopology } from '@sunshare/shared';
import { DataRow } from '@/components/ui/metric';
import { MeterBar, Tag } from '@/components/ui/tag';
import { SectionLabel } from '@/components/ui/panel';
import { congestionLevel, congestionTone, nodeUtilisation, utilisation } from '@/lib/domain';
import { km, kwh, pct, rupees } from '@/lib/format';
import { HOUSEHOLD_BY_NODE, NODE_BY_ID, displayName } from '@/lib/seed';
import type { Reading, SettledSlot } from '@/lib/mock/state-defaults';

/**
 * What a node actually is, from the network's point of view.
 *
 * Houses report generation, load and their trades; feeders and substations
 * report capacity, utilisation and what is hanging off them. The same
 * component serves the geographic map and the schematic grid view, because
 * they are two projections of one object.
 */
export function NodeInspector({
  nodeId,
  topology,
  readings,
  history,
}: {
  nodeId: string;
  topology: GridTopology;
  readings: Reading[];
  history: SettledSlot[];
}) {
  const node = topology.nodes.find((n) => n.id === nodeId) ?? NODE_BY_ID.get(nodeId);
  if (!node) return <p className="text-sm text-ink-3">Node not found in the current topology.</p>;

  const household = HOUSEHOLD_BY_NODE.get(nodeId);
  const reading = readings.find((r) => r.nodeId === nodeId);
  const children = topology.nodes.filter((n) => n.parentId === nodeId);
  const upstream = topology.edges.find((e) => e.toNodeId === nodeId);
  const u = upstream ? utilisation(upstream) : nodeUtilisation(node);
  const level = congestionLevel(u);

  const recent = history
    .slice(-8)
    .flatMap((s) =>
      s.trades
        .filter(
          (t) =>
            household &&
            (t.sellerId === household.userId || t.buyerId === household.userId),
        )
        .map((t) => ({ trade: t, slot: s })),
    )
    .slice(-5)
    .reverse();

  const routed = history
    .slice(-4)
    .flatMap((s) => s.match.pairs.filter((p) => p.pathNodeIds.includes(nodeId)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Tag tone={node.kind === 'HOUSE' ? 'neutral' : 'mains'}>{node.kind}</Tag>
        <Tag tone={congestionTone(level)} dot>
          {level}
        </Tag>
      </div>

      <dl>
        <DataRow label="Node">{node.id}</DataRow>
        <DataRow label="Parent">{node.parentId ?? 'Grid interface'}</DataRow>
        {household ? <DataRow label="Meter">{household.meterId}</DataRow> : null}
        {household ? <DataRow label="Type">{household.kind.toLowerCase()}</DataRow> : null}
      </dl>

      {reading ? (
        <div>
          <SectionLabel>Live</SectionLabel>
          <dl className="mt-1.5">
            <DataRow label="Generation" tone={reading.generationKw > 0 ? 'solar' : 'neutral'}>
              {kwh(reading.generationKw)} kW
            </DataRow>
            <DataRow label="Consumption" tone="mains">
              {kwh(reading.consumptionKw)} kW
            </DataRow>
            <DataRow label={reading.surplusKw >= 0 ? 'Surplus' : 'Import'} tone={reading.surplusKw >= 0 ? 'up' : 'down'}>
              {kwh(Math.abs(reading.surplusKw))} kW
            </DataRow>
            <DataRow label="Generated today">{kwh(reading.dayGenerationKwh)} kWh</DataRow>
            {household ? <DataRow label="Panel">{household.panelKw} kW</DataRow> : null}
          </dl>
        </div>
      ) : null}

      <div>
        <SectionLabel>Capacity</SectionLabel>
        <dl className="mt-1.5">
          <DataRow label="Rated">{node.capacityKw} kW</DataRow>
          <DataRow label="Load">{kwh(node.loadKw)} kW</DataRow>
          <DataRow label="Utilisation" tone={congestionTone(level)}>
            {pct(u * 100, 0)}
          </DataRow>
          {upstream ? (
            <>
              <DataRow label="Upstream span">{upstream.id}</DataRow>
              <DataRow label="Span length">{km(upstream.lengthKm)}</DataRow>
              <DataRow label="Headroom">
                {kwh(Math.max(0, upstream.capacityKw - upstream.currentLoadKw))} kW
              </DataRow>
            </>
          ) : null}
        </dl>
        <MeterBar value={u} tone={congestionTone(level)} className="mt-2" ariaLabel="Utilisation" />
      </div>

      {children.length > 0 ? (
        <div>
          <SectionLabel>Downstream</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {children.map((c) => {
              const cu = nodeUtilisation(c);
              return (
                <li key={c.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-ink-2">{c.name}</span>
                  <span className="shrink-0 font-mono tabular-nums text-ink-3">
                    {kwh(c.loadKw)} kW · {pct(cu * 100, 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div>
          <SectionLabel>Connected trades</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {recent.map(({ trade }) => {
              const selling = household && trade.sellerId === household.userId;
              return (
                <li key={trade.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-ink-2">
                    {selling ? '→ ' : '← '}
                    {displayName(selling ? trade.buyerId : trade.sellerId)}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-ink-3">
                    {kwh(trade.deliveredKwh)} kWh · {rupees(trade.pricePaise)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {routed.length > 0 ? (
        <div>
          <SectionLabel>Carried through</SectionLabel>
          <p className="mt-1.5 text-xs text-ink-2">
            <span className="font-mono tabular-nums">{routed.length}</span> matched deliveries in
            recent slots routed across this node, losing{' '}
            <span className="font-mono tabular-nums">
              {kwh(routed.reduce((s, p) => s + p.lossKwh, 0))} kWh
            </span>{' '}
            in transmission.
          </p>
        </div>
      ) : null}
    </div>
  );
}
