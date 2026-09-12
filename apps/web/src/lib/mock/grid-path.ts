/**
 * Routing across the radial distribution tree.
 *
 * Distribution networks are trees, not meshes, so the path between two
 * premises is "up to the lowest common ancestor, then back down". That is also
 * exactly what determines the loss tier: same feeder is cheap, same substation
 * costs more, crossing substations costs most.
 */
import { EDGES, NODE_BY_ID } from '@/lib/seed';
import type { HopTier } from '@/lib/domain';

const EDGE_LENGTH = new Map<string, number>();
for (const e of EDGES) {
  EDGE_LENGTH.set(`${e.fromNodeId}>${e.toNodeId}`, e.lengthKm);
  EDGE_LENGTH.set(`${e.toNodeId}>${e.fromNodeId}`, e.lengthKm);
}

export const EDGE_BY_PAIR = new Map<string, string>();
for (const e of EDGES) {
  EDGE_BY_PAIR.set(`${e.fromNodeId}>${e.toNodeId}`, e.id);
  EDGE_BY_PAIR.set(`${e.toNodeId}>${e.fromNodeId}`, e.id);
}

function ancestry(nodeId: string): string[] {
  const chain: string[] = [];
  let cur: string | null = nodeId;
  let guard = 0;
  while (cur && guard++ < 16) {
    chain.push(cur);
    cur = NODE_BY_ID.get(cur)?.parentId ?? null;
  }
  return chain;
}

/** Node ids from `a` to `b` inclusive, via the lowest common ancestor. */
export function pathBetween(a: string, b: string): string[] {
  if (a === b) return [a];
  const up = ancestry(a);
  const down = ancestry(b);
  const downSet = new Set(down);
  const lca = up.find((n) => downSet.has(n));
  if (!lca) return [a, b];

  const head = up.slice(0, up.indexOf(lca) + 1);
  const tail = down.slice(0, down.indexOf(lca)).reverse();
  return [...head, ...tail];
}

export function pathLengthKm(path: string[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += EDGE_LENGTH.get(`${path[i - 1]}>${path[i]}`) ?? 0;
  }
  return total;
}

export function pathEdgeIds(path: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < path.length; i++) {
    const id = EDGE_BY_PAIR.get(`${path[i - 1]}>${path[i]}`);
    if (id) out.push(id);
  }
  return out;
}

export function hopTier(a: string, b: string): HopTier {
  const fa = NODE_BY_ID.get(a)?.parentId;
  const fb = NODE_BY_ID.get(b)?.parentId;
  if (fa && fa === fb) return 'SAME_FEEDER';
  const sa = fa ? NODE_BY_ID.get(fa)?.parentId : null;
  const sb = fb ? NODE_BY_ID.get(fb)?.parentId : null;
  if (sa && sa === sb) return 'SAME_SUBSTATION';
  return 'CROSS_SUBSTATION';
}

/** Straight-line distance, used for the "how far away is this seller" column. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
