'use client';

/**
 * Platform bar — Diya.
 *
 * Mounted once in the dash shell (see (dash)/layout.tsx's "Diya mounts into
 * this" slot). Carries the three things every screen needs and nothing else:
 * data-freshness state (never let a stale number pass as live), the install
 * prompt, and a discreet demo-mode marker for judges.
 */
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useTickContext } from '@/hooks/tick-context';
import { useConnectionState } from '@/hooks/use-connection';
import { loadSnapshot } from '@/lib/offline-store';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

function formatClock(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !prompt) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void prompt.prompt();
        setPrompt(null);
      }}
      className="flex items-center gap-1.5 rounded border border-sun-600/40 px-2 py-1 text-xs
                 font-medium text-sun-600 hover:bg-sun-500/10 dark:text-sun-400"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      Install
    </button>
  );
}

export function PlatformBar() {
  const { tick, connected } = useTickContext();
  const { state } = useConnectionState(connected, tick?.tsReal ?? null);
  const [offlineAsOf, setOfflineAsOf] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'OFFLINE') return;
    void loadSnapshot().then((snap) => setOfflineAsOf(snap?.savedAt ?? null));
  }, [state]);

  const chipClass =
    state === 'LIVE'
      ? 'chip-live'
      : state === 'STALE'
        ? 'chip-stale'
        : state === 'OFFLINE'
          ? 'chip-offline'
          : 'chip-neutral';

  const label =
    state === 'OFFLINE'
      ? `OFFLINE — as of ${formatClock(offlineAsOf)}`
      : state === 'RECONNECTING'
        ? 'RECONNECTING…'
        : state === 'STALE'
          ? `STALE — ${formatClock(tick?.tsReal ?? null)}`
          : `LIVE — ${formatClock(tick?.tsReal ?? null)}`;

  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b
                 border-black/10 bg-white/95 px-4 py-2 text-xs dark:border-white/10 dark:bg-grid-900/95"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold tracking-tight text-grid-900 dark:text-slate-100">
          SUNSHARE
        </span>
        {USE_MOCKS && (
          <span className="chip-neutral hidden sm:inline-flex">Demo simulation</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={chipClass} aria-live="polite">
          {label}
        </span>
        <InstallButton />
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
