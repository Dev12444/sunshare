'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/controls';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Install prompt.
 *
 * Shown once, as a strip at the foot of the content column, and only after the
 * browser has told us the app is actually installable. Never a modal — the
 * market is the thing on screen.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem('sunshare-install-dismissed') === '1') setHidden(true);
    } catch {
      /* storage denied */
    }
  }, []);

  if (!event || hidden) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-rule/[.13] bg-surface px-3.5 py-2.5">
      <span className="text-label font-semibold uppercase text-ink-3">Install</span>
      <span className="min-w-0 flex-1 text-sm text-ink-2">
        Add SunShare to your home screen to keep the last market snapshot available offline.
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem('sunshare-install-dismissed', '1');
            } catch {
              /* storage denied */
            }
          }}
        >
          Not now
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
          }}
        >
          Install
        </Button>
      </div>
    </div>
  );
}

/** Registers the service worker built by Serwist. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    // MSW registers /mockServiceWorker.js at scope '/' and this registers
    // /sw.js at the same scope. A second register() with a different script
    // does not add a worker, it replaces the registration — so in a production
    // build with mocks on (how the demo actually ships) whichever call lands
    // last silently wins, and it is a race between AppShell's effect and this
    // one. Mock mode gives the scope to MSW; the offline view reads the
    // IndexedDB snapshot (lib/offline-store) and needs no worker either way.
    if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure only costs offline support, never the live app.
    });
  }, []);
  return null;
}
