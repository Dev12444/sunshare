'use client';

/**
 * Live tick feed — the single source of moving numbers on every dashboard.
 *
 * Reads straight off Dev's engine WebSocket (service workers do not intercept
 * WS, so PWA caching is irrelevant here). With NEXT_PUBLIC_USE_MOCKS=true it
 * reads Diya's fake emitter instead, so the frontend pair can build a fully
 * live-looking UI with zero backend running.
 */
import { useEffect, useRef, useState } from 'react';
import type { Tick } from '@sunshare/shared';
import { saveSnapshot } from '@/lib/offline-store';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const WS_URL = process.env.NEXT_PUBLIC_ENGINE_WS ?? 'ws://localhost:8000/ws';

export type TickState = {
  tick: Tick | null;
  connected: boolean;
  /** True once we have painted at least one frame from cache or the wire. */
  hydrated: boolean;
};

export function useTicks(): TickState {
  const [tick, setTick] = useState<Tick | null>(null);
  const [connected, setConnected] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let stop = () => {};

    if (USE_MOCKS) {
      // Lazy import so the mock emitter is never bundled into production.
      void import('@/mocks/fake-ws').then(({ startFakeTicks }) => {
        stop = startFakeTicks((t) => {
          setTick(t);
          setConnected(true);
          hydrated.current = true;
          void saveSnapshot(t.market, t.meters);
        });
      });
    } else {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onmessage = (msg) => {
        const t = JSON.parse(msg.data) as Tick;
        setTick(t);
        hydrated.current = true;
        void saveSnapshot(t.market, t.meters);
      };
      stop = () => ws.close();
    }

    return () => stop();
  }, []);

  return { tick, connected, hydrated: hydrated.current };
}
