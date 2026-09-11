/**
 * Offline fallback — Diya, H1–H3.
 * Served by the service worker when a navigation fails.
 * TODO: read the last known market state from IndexedDB and render it here
 * with an "as of HH:MM" banner, instead of this placeholder.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="text-4xl">🌙</span>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-grid-400">
        SunShare is showing your last known market snapshot. Live trading
        resumes automatically when you reconnect.
      </p>
    </main>
  );
}
