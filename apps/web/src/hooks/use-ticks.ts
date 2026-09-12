'use client';

/**
 * Live tick feed.
 *
 * Kept as a thin read over the application store rather than its own socket:
 * `transport.ts` owns exactly one connection (engine WebSocket, or the local
 * simulator when NEXT_PUBLIC_USE_MOCKS=true) and writes every frame into the
 * store, so a second subscriber here would mean two clocks disagreeing on
 * screen. Components that only need the current tick can use this; components
 * that need the book, the ledger or the topology should select from the store
 * directly.
 */
import type { Tick } from '@sunshare/shared';
import { useStore } from '@/lib/store';

export type TickState = {
  tick: Tick | null;
  connected: boolean;
  /** True once at least one frame has been painted, live or from cache. */
  hydrated: boolean;
};

export function useTicks(): TickState {
  const tick = useStore((s) => s.tick);
  const connection = useStore((s) => s.connection);
  const fromCache = useStore((s) => s.fromCache);

  return {
    tick,
    connected: connection === 'live',
    hydrated: tick !== null || fromCache,
  };
}
