'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { mobileNavFor, navFor } from './nav-config';
import { SimControls } from './sim-controls';
import { IconMenu } from './icons';

/**
 * Bottom navigation for phones.
 *
 * Five destinations, thumb-height targets, safe-area padding. The remaining
 * routes live behind "More" rather than being crushed into a sixth slot.
 */
export function MobileNav() {
  const role = useStore((s) => s.role);
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = mobileNavFor(role);
  const all = navFor(role);
  const overflow = all.filter((i) => !items.some((m) => m.href === i.href));

  return (
    <>
      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-ink/25 lg:hidden"
          />
          <div className="panel fixed inset-x-0 bottom-[58px] z-50 rounded-t-[4px] lg:hidden">
            <div className="px-3.5 py-2.5">
              <div className="text-label font-semibold uppercase text-ink-3">More</div>
              <ul className="mt-2 grid grid-cols-2 gap-1">
                {overflow.map((i) => {
                  const Icon = i.icon;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-2 rounded-sm border border-rule/15 px-2.5 py-2 text-sm text-ink"
                      >
                        <Icon className="text-ink-3" />
                        {i.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="border-t border-rule/[.13] px-3.5 py-2.5">
              <SimControls layout="row" />
            </div>
          </div>
        </>
      ) : null}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule/[.16] bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-6">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-[58px] flex-col items-center justify-center gap-1',
                    active ? 'text-ink' : 'text-ink-3',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-3 top-0 h-[2px]',
                      active ? 'bg-solar' : 'bg-transparent',
                    )}
                  />
                  <Icon size={16} />
                  <span className="text-micro font-medium tracking-normal">{item.short}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={cn(
                'flex h-[58px] w-full flex-col items-center justify-center gap-1',
                moreOpen ? 'text-ink' : 'text-ink-3',
              )}
            >
              <IconMenu size={16} />
              <span className="text-micro font-medium tracking-normal">More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
