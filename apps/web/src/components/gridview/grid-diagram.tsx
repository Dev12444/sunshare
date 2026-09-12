'use client';

import { useMemo } from 'react';
import type { GridTopology } from '@sunshare/shared';
import { congestionLevel, utilisation } from '@/lib/domain';
import { kwh, pct } from '@/lib/format';
import { HOUSEHOLD_BY_NODE } from '@/lib/seed';
import type { Reading } from '@/lib/mock/state-defaults';

const W = 1000;
const H = 430;
const TIE_Y = 26;
const BUS_Y = 62;
const FEEDER_Y = 132;
const HOUSE_Y0 = 196;
const HOUSE_GAP = 62;

const LEVEL_COLOUR = {
  NORMAL: 'rgb(var(--up))',
  HIGH: 'rgb(var(--warn))',
  CRITICAL: 'rgb(var(--down))',
} as const;

interface Placed {
  id: string;
  x: number;
  y: number;
  kind: 'SUBSTATION' | 'FEEDER' | 'HOUSE';
}

/**
 * Single-line diagram.
 *
 * The geographic map answers "where is this"; this answers "what is it wired
 * to". It is drawn the way a distribution utility draws it: substations on a
 * busbar at the top, feeders dropping off the bus, premises tapped off the
 * feeder run — so the shape on screen is the shape on the operator's wall.
 */
export function GridDiagram({
  topology,
  readings,
  selectedNodeId,
  onSelectNode,
  activePathNodeIds = [],
}: {
  topology: GridTopology;
  readings: Reading[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  activePathNodeIds?: string[][];
}) {
  const readingByNode = useMemo(() => new Map(readings.map((r) => [r.nodeId, r])), [readings]);

  const layout = useMemo(() => {
    const subs = topology.nodes.filter((n) => n.kind === 'SUBSTATION');
    const feeders = topology.nodes.filter((n) => n.kind === 'FEEDER');
    const placed = new Map<string, Placed>();

    // Wide enough that a premise label tapped off the leftmost or rightmost
    // feeder still has room to sit outside the run without clipping.
    const margin = 150;
    const span = W - margin * 2;
    const step = feeders.length > 1 ? span / (feeders.length - 1) : 0;

    feeders.forEach((f, i) => {
      placed.set(f.id, { id: f.id, x: margin + i * step, y: FEEDER_Y, kind: 'FEEDER' });
    });

    // A substation sits over the midpoint of the feeders it serves.
    subs.forEach((s) => {
      const own = feeders.filter((f) => f.parentId === s.id).map((f) => placed.get(f.id)!.x);
      const x = own.length ? own.reduce((a, b) => a + b, 0) / own.length : margin;
      placed.set(s.id, { id: s.id, x, y: BUS_Y, kind: 'SUBSTATION' });
    });

    topology.nodes
      .filter((n) => n.kind === 'HOUSE')
      .forEach((h) => {
        const parent = h.parentId ? placed.get(h.parentId) : undefined;
        if (!parent) return;
        const siblings = topology.nodes.filter((n) => n.parentId === h.parentId);
        const index = siblings.findIndex((n) => n.id === h.id);
        placed.set(h.id, {
          id: h.id,
          // Tap alternately left and right off the feeder run.
          x: parent.x + (index % 2 === 0 ? -46 : 46),
          y: HOUSE_Y0 + index * HOUSE_GAP,
          kind: 'HOUSE',
        });
      });

    return placed;
  }, [topology.nodes]);

  const busExtent = useMemo(() => {
    const map = new Map<string, { x1: number; x2: number }>();
    for (const s of topology.nodes.filter((n) => n.kind === 'SUBSTATION')) {
      const xs = topology.nodes
        .filter((n) => n.parentId === s.id && n.kind === 'FEEDER')
        .map((f) => layout.get(f.id)?.x ?? 0);
      const own = layout.get(s.id)?.x ?? 0;
      map.set(s.id, {
        x1: Math.min(own, ...xs) - 26,
        x2: Math.max(own, ...xs) + 26,
      });
    }
    return map;
  }, [topology.nodes, layout]);

  const activeEdges = useMemo(() => {
    const set = new Set<string>();
    for (const path of activePathNodeIds) {
      for (let i = 1; i < path.length; i++) {
        set.add(`${path[i - 1]}|${path[i]}`);
        set.add(`${path[i]}|${path[i - 1]}`);
      }
    }
    return set;
  }, [activePathNodeIds]);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[760px]"
        role="img"
        aria-label="Single-line diagram of the Sector 21 distribution network."
      >
        {/* Substation tie */}
        {(() => {
          const a = layout.get('SS-1');
          const b = layout.get('SS-2');
          const tie = topology.edges.find((e) => e.id === 'e-SS-1-SS-2');
          if (!a || !b || !tie) return null;
          const u = utilisation(tie);
          return (
            <g>
              <path
                d={`M ${a.x} ${BUS_Y - 18} V ${TIE_Y} H ${b.x} V ${BUS_Y - 18}`}
                fill="none"
                stroke={LEVEL_COLOUR[congestionLevel(u)]}
                strokeWidth={3}
                opacity={0.8}
              />
              <text
                x={(a.x + b.x) / 2}
                y={TIE_Y - 7}
                textAnchor="middle"
                className="fill-[rgb(var(--ink-3))] font-mono text-[10px]"
              >
                TIE · {pct(u * 100, 0)} of {tie.capacityKw} kW
              </text>
            </g>
          );
        })()}

        {/* Substation busbars */}
        {topology.nodes
          .filter((n) => n.kind === 'SUBSTATION')
          .map((s) => {
            const p = layout.get(s.id);
            const extent = busExtent.get(s.id);
            if (!p || !extent) return null;
            const u = utilisation({ currentLoadKw: s.loadKw, capacityKw: s.capacityKw });
            return (
              <g key={s.id}>
                <line
                  x1={extent.x1}
                  y1={BUS_Y}
                  x2={extent.x2}
                  y2={BUS_Y}
                  stroke="rgb(var(--ink))"
                  strokeWidth={4}
                  opacity={0.85}
                />
                <NodeBox
                  x={p.x}
                  y={BUS_Y - 18}
                  width={112}
                  height={0}
                  label={s.name}
                  sub={`${kwh(s.loadKw)} / ${s.capacityKw} kW · ${pct(u * 100, 0)}`}
                  level={congestionLevel(u)}
                  selected={selectedNodeId === s.id}
                  onClick={() => onSelectNode(s.id)}
                  anchor="above"
                />
              </g>
            );
          })}

        {/* Feeder drops and runs */}
        {topology.nodes
          .filter((n) => n.kind === 'FEEDER')
          .map((f) => {
            const p = layout.get(f.id);
            if (!p) return null;
            const drop = topology.edges.find((e) => e.toNodeId === f.id);
            const u = drop
              ? utilisation(drop)
              : utilisation({ currentLoadKw: f.loadKw, capacityKw: f.capacityKw });
            const level = congestionLevel(u);
            const houses = topology.nodes.filter((n) => n.parentId === f.id);
            const runEnd = HOUSE_Y0 + Math.max(0, houses.length - 1) * HOUSE_GAP;

            return (
              <g key={f.id}>
                <line
                  x1={p.x}
                  y1={BUS_Y}
                  x2={p.x}
                  y2={FEEDER_Y - 15}
                  stroke={LEVEL_COLOUR[level]}
                  strokeWidth={3}
                />
                <line
                  x1={p.x}
                  y1={FEEDER_Y + 15}
                  x2={p.x}
                  y2={runEnd}
                  stroke={LEVEL_COLOUR[level]}
                  strokeWidth={2}
                  opacity={0.55}
                />
                <NodeBox
                  x={p.x}
                  y={FEEDER_Y}
                  width={104}
                  height={30}
                  label={f.id}
                  sub={`${pct(u * 100, 0)} · ${kwh(Math.max(0, f.capacityKw - f.loadKw))} kW free`}
                  level={level}
                  selected={selectedNodeId === f.id}
                  onClick={() => onSelectNode(f.id)}
                />
              </g>
            );
          })}

        {/* Premises */}
        {topology.nodes
          .filter((n) => n.kind === 'HOUSE')
          .map((h) => {
            const p = layout.get(h.id);
            const feeder = h.parentId ? layout.get(h.parentId) : undefined;
            if (!p || !feeder) return null;
            const reading = readingByNode.get(h.id);
            const household = HOUSEHOLD_BY_NODE.get(h.id);
            const exporting = (reading?.surplusKw ?? 0) > 0.02;
            const active = activeEdges.has(`${h.parentId}|${h.id}`);
            const left = p.x < feeder.x;

            return (
              <g key={h.id}>
                <line
                  x1={feeder.x}
                  y1={p.y}
                  x2={p.x + (left ? 52 : -52)}
                  y2={p.y}
                  stroke={active ? 'rgb(var(--solar))' : 'rgb(var(--ink-3))'}
                  strokeWidth={active ? 2 : 1.2}
                  strokeDasharray={active ? '5 5' : undefined}
                  className={active ? 'flow-line' : undefined}
                  opacity={active ? 1 : 0.5}
                />
                <PremiseGlyph
                  x={p.x}
                  y={p.y}
                  left={left}
                  name={household?.shortName ?? h.name}
                  value={
                    reading
                      ? exporting
                        ? `+${kwh(reading.surplusKw)} kW`
                        : `−${kwh(Math.abs(reading.surplusKw))} kW`
                      : '—'
                  }
                  exporting={exporting}
                  selected={selectedNodeId === h.id}
                  onClick={() => onSelectNode(h.id)}
                />
              </g>
            );
          })}
      </svg>
    </div>
  );
}

function NodeBox({
  x,
  y,
  width,
  label,
  sub,
  level,
  selected,
  onClick,
  anchor = 'centre',
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub: string;
  level: keyof typeof LEVEL_COLOUR;
  selected: boolean;
  onClick: () => void;
  anchor?: 'centre' | 'above';
}) {
  const h = 30;
  const top = anchor === 'above' ? y - h : y - h / 2;
  return (
    <g
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className="cursor-pointer outline-none"
      aria-label={`${label}, ${sub}`}
    >
      <rect
        x={x - width / 2}
        y={top}
        width={width}
        height={h}
        fill="rgb(var(--surface))"
        stroke={selected ? 'rgb(var(--ink))' : LEVEL_COLOUR[level]}
        strokeWidth={selected ? 2 : 1.3}
      />
      <text
        x={x}
        y={top + 13}
        textAnchor="middle"
        className="fill-[rgb(var(--ink))] font-mono text-[11px] font-medium"
      >
        {label}
      </text>
      <text
        x={x}
        y={top + 24}
        textAnchor="middle"
        className="fill-[rgb(var(--ink-3))] font-mono text-[9px]"
      >
        {sub}
      </text>
    </g>
  );
}

function PremiseGlyph({
  x,
  y,
  left,
  name,
  value,
  exporting,
  selected,
  onClick,
}: {
  x: number;
  y: number;
  left: boolean;
  name: string;
  value: string;
  exporting: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const colour = exporting ? 'rgb(var(--solar))' : 'rgb(var(--mains))';
  return (
    <g
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className="cursor-pointer outline-none"
      aria-label={`${name}, ${value}`}
    >
      <rect
        x={x - 9}
        y={y - 9}
        width={18}
        height={18}
        fill={exporting ? colour : 'rgb(var(--surface))'}
        fillOpacity={exporting ? 0.5 : 1}
        stroke={selected ? 'rgb(var(--ink))' : colour}
        strokeWidth={selected ? 2 : 1.4}
      />
      <text
        x={left ? x - 15 : x + 15}
        y={y - 1}
        textAnchor={left ? 'end' : 'start'}
        className="fill-[rgb(var(--ink))] text-[10px]"
      >
        {name}
      </text>
      <text
        x={left ? x - 15 : x + 15}
        y={y + 10}
        textAnchor={left ? 'end' : 'start'}
        className="fill-[rgb(var(--ink-3))] font-mono text-[9px]"
      >
        {value}
      </text>
    </g>
  );
}
