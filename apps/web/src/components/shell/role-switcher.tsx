'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Role } from '@sunshare/shared';
import { ROLE_LABEL, ROLE_SUBTITLE, SESSIONS } from '@/lib/seed';
import { setRole, useStore } from '@/lib/store';
import { signOut } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { navFor } from './nav-config';
import { IconChevron } from './icons';

const ORDER: Role[] = ['PROSUMER', 'CONSUMER', 'DISCOM', 'REGULATOR'];

/**
 * Role switcher.
 *
 * There is no authentication in the demo, so this is the account menu: it
 * names who you are acting as, and switching takes you to that role's own
 * landing surface rather than leaving you on a page they cannot use.
 */
export function RoleSwitcher() {
  const role = useStore((s) => s.role);
  const user = useStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

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

  function choose(next: Role) {
    setRole(next);
    setOpen(false);
    const nav = navFor(next);
    if (!nav.some((i) => i.href === pathname)) router.push(nav[0].href);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 items-center gap-2 rounded-sm border border-rule/20 bg-surface pl-2 pr-1.5',
          'hover:bg-sunken',
          open && 'bg-sunken',
        )}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-[2px] bg-ink text-[9px] font-semibold text-paper">
          {user.name.slice(0, 1)}
        </span>
        <span className="hidden text-sm font-medium text-ink sm:inline">{ROLE_LABEL[role]}</span>
        <IconChevron className="rotate-90 text-ink-3" size={11} />
      </button>

      {open ? (
        <div role="menu" className="panel absolute right-0 top-10 z-50 w-[248px]">
          <div className="border-b border-rule/[.13] px-3 py-2">
            <div className="text-label font-semibold uppercase text-ink-3">Acting as</div>
            <div className="mt-0.5 text-sm text-ink">{user.name}</div>
            {user.walletAddress ? (
              <div className="mt-0.5 truncate font-mono text-xs text-ink-3">
                {user.walletAddress.slice(0, 10)}…{user.walletAddress.slice(-6)}
              </div>
            ) : null}
          </div>
          <ul>
            {ORDER.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={r === role}
                  onClick={() => choose(r)}
                  className={cn(
                    'flex w-full items-start gap-2 border-b border-rule/[.09] px-3 py-2 text-left last:border-b-0',
                    r === role ? 'bg-solar-wash/50' : 'hover:bg-sunken',
                  )}
                >
                  <span
                    className={cn(
                      'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
                      r === role ? 'bg-solar' : 'bg-rule/30',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{ROLE_LABEL[r]}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">
                      {ROLE_SUBTITLE[r]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-rule/[.13] px-3 py-2 text-xs text-ink-3">
            Demo identities, no authentication. Seeded from{' '}
            <span className="font-mono">{Object.keys(SESSIONS).length}</span> roles.
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              signOut();
              router.push('/login');
            }}
            className="w-full border-t border-rule/[.13] px-3 py-2 text-left text-sm text-ink hover:bg-sunken"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
