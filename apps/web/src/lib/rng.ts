/**
 * Seeded pseudo-randomness.
 *
 * Every "random" number in the demo is a pure function of a string key, so two
 * runs of the pitch produce byte-identical numbers. Nothing here ever calls
 * Math.random().
 */

export function hashString(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for load jitter and ask spreads. */
export function rngFrom(key: string): () => number {
  let a = hashString(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One draw, no generator to carry around. */
export function seeded(key: string, min = 0, max = 1): number {
  return min + rngFrom(key)() * (max - min);
}

export function pick<T>(key: string, items: readonly T[]): T {
  return items[Math.floor(seeded(key) * items.length) % items.length];
}
