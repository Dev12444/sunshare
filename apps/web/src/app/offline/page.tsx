'use client';

/**
 * Offline fallback — Diya, H1–H3.
 * Served by the service worker when a navigation fails. Reads the last
 * snapshot saved by src/lib/offline-store.ts and paints it behind an
 * explicit "as of HH:MM" banner — never implying the numbers are live.
 */
import { useEffect, useState } from 'react';
import { loadSnapshot } from '@/lib/offline-store';
import type { MarketState } from '@sunshare/shared';

export default function OfflinePage() {
  const [snapshot, setSnapshot] = useState<{ market: MarketState; savedAt: string } | null | undefined>(
    undefined,
  );

  useEffect(() => {
    void loadSnapshot().then(setSnapshot);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="chip-offline">Offline</span>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-grid-400">
        Live trading resumes automatically when you reconnect. Showing the last
        market snapshot saved to this device.
      </p>

      {snapshot === undefined && (
        <p className="text-xs text-grid-400">Checking for a saved snapshot…</p>
      )}

      {snapshot === null && (
        <p className="text-xs text-grid-400">
          No snapshot saved yet — open SunShare once while online to enable this view.
        </p>
      )}

      {snapshot && (
        <div className="tile w-full max-w-xs text-left text-sm">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-grid-400">
            As of {new Date(snapshot.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="flex items-center justify-between divider-row py-1.5">
            <span className="text-grid-400">Indicative price</span>
            <span className="figure">₹{(snapshot.market.indicativePricePaise / 100).toFixed(2)}/kWh</span>
          </div>
          <div className="flex items-center justify-between divider-row py-1.5">
            <span className="text-grid-400">Supply / demand</span>
            <span className="figure">
              {snapshot.market.totalSupplyKwh.toFixed(1)} / {snapshot.market.totalDemandKwh.toFixed(1)} kWh
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-grid-400">Active listings</span>
            <span className="figure">{snapshot.market.activeListings}</span>
          </div>
        </div>
      )}
    </main>
  );
}
