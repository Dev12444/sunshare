'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { simClock } from '@/lib/format';
import { dismissNotice, markNoticesRead, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { IconBell } from './icons';

const TONE_RULE = {
  neutral: 'border-l-ink-3',
  up: 'border-l-up',
  down: 'border-l-down',
  solar: 'border-l-solar',
} as const;

/**
 * Notification centre.
 *
 * Everything in here is transactional: something was sold, matched, allocated
 * or moved. Nothing is promotional, and nothing arrives that the user cannot
 * act on or verify on another screen.
 */
export function NotificationCenter() {
  const notices = useStore((s) => s.notices);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notices.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markNoticesRead();
        }}
        className={cn(
          'relative flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 hover:bg-sunken hover:text-ink',
          open && 'bg-sunken text-ink',
        )}
      >
        <IconBell />
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-solar" />
        ) : null}
      </button>

      {open ? (
        <div className="panel absolute right-0 top-9 z-50 max-h-[70dvh] w-[min(92vw,360px)] overflow-y-auto">
          <header className="panel-head sticky top-0 bg-surface">
            <span className="text-label font-semibold uppercase text-ink-2">Activity</span>
            <span className="font-mono text-xs tabular-nums text-ink-3">{notices.length}</span>
          </header>
          {notices.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm text-ink-3">
              Nothing yet. Trades, broker decisions and settlements appear here as they happen.
            </p>
          ) : (
            <ul>
              {notices.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'border-b border-l-2 border-b-rule/[.09] px-3 py-2.5 last:border-b-0',
                    TONE_RULE[n.tone],
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{n.title}</span>
                    <time className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
                      {simClock(n.tsSim)}
                    </time>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-2">{n.body}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className="text-xs font-medium text-ink underline decoration-rule/40 underline-offset-2 hover:decoration-ink"
                      >
                        Inspect
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => dismissNotice(n.id)}
                      className="text-xs text-ink-3 hover:text-ink"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
