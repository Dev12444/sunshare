'use client';

/**
 * Live activity feed — trades, settlements, broker decisions, donations.
 * Same USE_MOCKS split as use-ticks.ts: replays the demo timeline when
 * mocking, subscribes to the real /api/events SSE stream otherwise.
 */
import { useEffect, useState } from 'react';
import type { ServerEvent } from '@sunshare/shared';
import { subscribeToEvents } from '@/lib/sse';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const MAX_EVENTS = 200;

export function useActivity(): { events: ServerEvent[]; connected: boolean } {
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let stop = () => {};

    if (USE_MOCKS) {
      void import('@/mocks/fake-events').then(({ replayedHistory }) => {
        setEvents(replayedHistory().slice(-MAX_EVENTS));
        setConnected(true);
      });
    } else {
      stop = subscribeToEvents(
        (e) => setEvents((prev) => [...prev.slice(-(MAX_EVENTS - 1)), e]),
        () => setConnected(false),
      );
      setConnected(true);
    }

    return () => stop();
  }, []);

  return { events, connected };
}
