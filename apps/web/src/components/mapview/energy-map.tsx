'use client';

import 'leaflet/dist/leaflet.css';
import { divIcon } from 'leaflet';
import { useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { GridTopology } from '@sunshare/shared';
import { congestionLevel, nodeUtilisation, utilisation } from '@/lib/domain';
import { kwh, pct } from '@/lib/format';
import { HOUSEHOLD_BY_NODE, NODE_BY_ID } from '@/lib/seed';
import type { Reading } from '@/lib/mock/state-defaults';

export interface FlowPath {
  id: string;
  nodeIds: string[];
  kwh: number;
}

export interface MapFilters {
  producers: boolean;
  consumers: boolean;
  flows: boolean;
  congestion: boolean;
  topology: boolean;
}

const COLOR = {
  normal: 'rgb(var(--up))',
  high: 'rgb(var(--warn))',
  critical: 'rgb(var(--down))',
  solar: 'rgb(var(--solar))',
  mains: 'rgb(var(--mains))',
  ink: 'rgb(var(--ink))',
  ink3: 'rgb(var(--ink-3))',
};

/**
 * The local energy map.
 *
 * Encoding, all of it load-bearing:
 *   conductor colour  = congestion on that span
 *   conductor width   = its capacity
 *   house fill        = exporting (solar) or importing (mains)
 *   house radius      = magnitude of that flow
 *   marching dashes   = energy actually moving under a matched trade
 *
 * Nothing on this map is drawn because it looks good. Tiles are desaturated in
 * CSS so the only saturated colour on screen is carrying information.
 */
export function EnergyMap({
  topology,
  readings,
  flows,
  filters,
  selectedNodeId,
  onSelectNode,
}: {
  topology: GridTopology;
  readings: Reading[];
  flows: FlowPath[];
  filters: MapFilters;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const readingByNode = useMemo(
    () => new Map(readings.map((r) => [r.nodeId, r])),
    [readings],
  );
  const nodeById = useMemo(
    () => new Map(topology.nodes.map((n) => [n.id, n])),
    [topology.nodes],
  );

  const position = (id: string): [number, number] | null => {
    const n = nodeById.get(id) ?? NODE_BY_ID.get(id);
    return n ? [n.lat, n.lng] : null;
  };

  return (
    <MapContainer
      center={[23.2215, 72.6405]}
      zoom={14}
      scrollWheelZoom
      className="h-full w-full"
      attributionControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap"
        maxZoom={19}
      />

      {filters.topology
        ? topology.edges.map((e) => {
            const from = position(e.fromNodeId);
            const to = position(e.toNodeId);
            if (!from || !to) return null;
            const u = utilisation(e);
            const level = congestionLevel(u);
            const congested = level !== 'NORMAL';
            const colour = filters.congestion
              ? COLOR[level.toLowerCase() as 'normal' | 'high' | 'critical']
              : COLOR.ink3;
            return (
              <Polyline
                key={e.id}
                positions={[from, to]}
                pathOptions={{
                  color: colour,
                  weight: e.capacityKw >= 200 ? 4 : e.capacityKw >= 60 ? 2.6 : 1.5,
                  opacity: congested && filters.congestion ? 0.95 : 0.5,
                }}
              >
                <Tooltip sticky>
                  <span className="font-mono text-xs">
                    {e.id} · {pct(u * 100, 0)} of {e.capacityKw} kW · {level.toLowerCase()}
                  </span>
                </Tooltip>
              </Polyline>
            );
          })
        : null}

      {filters.flows
        ? flows.map((f) => {
            const points = f.nodeIds
              .map(position)
              .filter((p): p is [number, number] => p !== null);
            if (points.length < 2) return null;
            return (
              <Polyline
                key={f.id}
                positions={points}
                className="flow-line"
                pathOptions={{ color: COLOR.solar, weight: 2.4, opacity: 0.95 }}
              >
                <Tooltip sticky>
                  <span className="font-mono text-xs">{kwh(f.kwh)} kWh in transit</span>
                </Tooltip>
              </Polyline>
            );
          })
        : null}

      {topology.nodes.map((n) => {
        const pos = position(n.id);
        if (!pos) return null;

        if (n.kind !== 'HOUSE') {
          const u = nodeUtilisation(n);
          const level = congestionLevel(u);
          const colour = filters.congestion
            ? COLOR[level.toLowerCase() as 'normal' | 'high' | 'critical']
            : COLOR.ink;
          const isSub = n.kind === 'SUBSTATION';
          return (
            <Marker
              key={n.id}
              position={pos}
              icon={divIcon({
                className: 'node-glyph',
                iconSize: isSub ? [18, 18] : [13, 13],
                iconAnchor: isSub ? [9, 9] : [6.5, 6.5],
                html: isSub
                  ? `<div style="width:18px;height:18px;border:2px solid ${colour};background:rgb(var(--surface));display:flex;align-items:center;justify-content:center">
                       <div style="width:8px;height:2px;background:${colour}"></div>
                     </div>`
                  : `<div style="width:13px;height:13px;border:1.6px solid ${colour};background:rgb(var(--surface));transform:rotate(45deg)"></div>`,
              })}
              eventHandlers={{ click: () => onSelectNode(n.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <span className="font-mono text-xs">
                  {n.name} · {kwh(n.loadKw)} kW · {pct(u * 100, 0)}
                </span>
              </Tooltip>
            </Marker>
          );
        }

        const reading = readingByNode.get(n.id);
        const household = HOUSEHOLD_BY_NODE.get(n.id);
        const surplus = reading?.surplusKw ?? 0;
        const exporting = surplus > 0.02;

        if (exporting && !filters.producers) return null;
        if (!exporting && !filters.consumers) return null;

        const magnitude = Math.min(9, 4 + Math.abs(surplus) * 1.5);
        const selected = selectedNodeId === n.id;

        return (
          <CircleMarker
            key={n.id}
            center={pos}
            radius={magnitude}
            pathOptions={{
              color: selected ? COLOR.ink : exporting ? COLOR.solar : COLOR.mains,
              weight: selected ? 2.4 : 1.4,
              fillColor: exporting ? COLOR.solar : COLOR.mains,
              fillOpacity: exporting ? 0.62 : 0.3,
            }}
            eventHandlers={{ click: () => onSelectNode(n.id) }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <span className="font-mono text-xs">
                {household?.shortName ?? n.name} ·{' '}
                {exporting ? `+${kwh(surplus)} kW surplus` : `${kwh(-surplus)} kW import`}
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
