'use client';

import { simClock } from '@/lib/format';
import { retryConnection } from '@/lib/transport';
import { useStore, type ConnectionState } from '@/lib/store';
import { cn } from '@/lib/utils';

const COPY: Record<ConnectionState, { label: string; dot: string; tone: string }> = {
  live: { label: 'Live', dot: 'bg-up', tone: 'text-ink-2' },
  connecting: { label: 'Connecting', dot: 'bg-warn animate-pulse-dot', tone: 'text-ink-2' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warn animate-pulse-dot', tone: 'text-warn' },
  offline: { label: 'Offline', dot: 'bg-ink-3', tone: 'text-ink-2' },
  error: { label: 'Feed down', dot: 'bg-down', tone: 'text-down' },
};

/** The one place that says whether the numbers on screen are current. */
export function ConnectionIndicator({ className }: { className?: string }) {
  const connection = useStore((s) => s.connection);
  const lastSync = useStore((s) => s.lastSyncSim);
  const fromCache = useStore((s) => s.fromCache);
  const meta = COPY[connection];
  const stale = connection !== 'live' && lastSync;

  return (
    <button
      type="button"
      onClick={connection === 'live' ? undefined : retryConnection}
      aria-live="polite"
      title={
        stale
          ? `Last frame received at ${simClock(lastSync!)}${fromCache ? ' (from local cache)' : ''}`
          : 'Receiving live ticks'
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs',
        connection !== 'live' && 'hover:bg-sunken',
        meta.tone,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      <span className="hidden font-medium sm:inline">{meta.label}</span>
      {stale ? (
        <span className="font-mono tabular-nums text-ink-3">{simClock(lastSync!)}</span>
      ) : null}
    </button>
  );
}

/**
 * The offline strip. It never replaces the dashboard — the last known market
 * state stays on screen behind it, which is the entire point of the IndexedDB
 * snapshot.
 */
export function OfflineBanner() {
  const online = useStore((s) => s.online);
  const fromCache = useStore((s) => s.fromCache);
  const lastSync = useStore((s) => s.lastSyncSim);
  const error = useStore((s) => s.error);

  if (online && !error && !fromCache) return null;

  const offline = !online;
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-xs',
        offline ? 'border-rule/20 bg-sunken' : 'border-down/25 bg-down-wash/50',
      )}
    >
      <span
        className={cn(
          'text-label font-semibold uppercase',
          offline ? 'text-ink-2' : 'text-down',
        )}
      >
        {offline ? 'Offline' : 'Degraded'}
      </span>
      <span className="min-w-0 flex-1 text-ink-2">
        {offline
          ? lastSync
            ? `Showing market data from ${simClock(lastSync)}. Trading resumes automatically when the connection returns.`
            : 'No cached market data on this device yet.'
          : (error ?? 'Live feed interrupted. Showing the last received market state.')}
      </span>
      {!offline ? (
        <button
          type="button"
          onClick={retryConnection}
          className="rounded-sm border border-rule/25 bg-surface px-2 py-0.5 font-medium text-ink hover:bg-sunken"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
