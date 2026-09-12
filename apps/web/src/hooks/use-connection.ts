'use client';

/**
 * Connection/freshness state — Diya, H5–H6.5.
 *
 * One state machine feeding every "LIVE / STALE / OFFLINE / RECONNECTING"
 * indicator in the app, so the platform never implies a stale number is
 * live. Derived from navigator.onLine, the tick socket's connected flag, and
 * how long it has been since the last tick actually arrived.
 */
import { useEffect, useState } from 'react';

export type ConnectionState = 'LIVE' | 'STALE' | 'OFFLINE' | 'RECONNECTING';

const STALE_AFTER_MS = 8_000;

export function useConnectionState(connected: boolean, lastUpdatedReal: string | null): {
  state: ConnectionState;
  lastUpdatedReal: string | null;
} {
  const [online, setOnline] = useState(true);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!lastUpdatedReal) return;
    setStale(false);
    const id = setTimeout(() => setStale(true), STALE_AFTER_MS);
    return () => clearTimeout(id);
  }, [lastUpdatedReal]);

  let state: ConnectionState;
  if (!online) state = 'OFFLINE';
  else if (!connected) state = lastUpdatedReal ? 'RECONNECTING' : 'STALE';
  else state = stale ? 'STALE' : 'LIVE';

  return { state, lastUpdatedReal };
}
