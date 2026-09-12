/**
 * Per-slot order-book commitment — Rahi, H13. Cut-list item #2.
 *
 * Publishing a Merkle root of the book before settling means nobody can claim
 * afterwards that the orders were different. Settlement works without it, which
 * is why this is the second thing to drop if time runs out.
 */
import { concat, keccak256, toUtf8Bytes } from 'ethers';

export interface BookLeaf {
  kind: 'listing' | 'bid';
  id: string;
  party: string;
  nodeId: string;
  kwh: number;
  pricePaise: number;
}

/**
 * Canonical, order-independent encoding. Field order is fixed here rather than
 * taken from object key order so a leaf hashes the same on any runtime.
 */
export function hashLeaf(leaf: BookLeaf): string {
  const canonical = [
    leaf.kind,
    leaf.id,
    leaf.party,
    leaf.nodeId,
    leaf.kwh.toFixed(6),
    String(leaf.pricePaise),
  ].join('|');

  return keccak256(toUtf8Bytes(canonical));
}

/** Sorted-pair hashing, so the root does not depend on sibling order. */
function hashPair(a: string, b: string): string {
  const [left, right] = a <= b ? [a, b] : [b, a];
  return keccak256(concat([left, right]));
}

export const EMPTY_ROOT = `0x${'0'.repeat(64)}`;

export function merkleRoot(leaves: BookLeaf[]): string {
  if (leaves.length === 0) return EMPTY_ROOT;

  // Leaves are sorted so the same book always produces the same root
  // regardless of the order the database happened to return rows in.
  let level = leaves.map(hashLeaf).sort();

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      // An odd node is promoted rather than paired with itself, which would
      // make a 3-leaf book collide with a 4-leaf one that repeats the last.
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    }
    level = next;
  }

  return level[0];
}
