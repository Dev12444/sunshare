'use client';

import { useEffect, type ReactNode } from 'react';
import { startTransport } from '@/lib/transport';
import { ConnectionIndicator, OfflineBanner } from './connection';
import { MobileNav } from './mobile-nav';
import { NavRail } from './nav-rail';
import { NotificationCenter } from './notifications';
import { RoleSwitcher } from './role-switcher';
import { ServiceWorkerRegistrar } from './install-prompt';
import { SimStatus, SlotRibbon } from './sim-status';
import { ThemeToggle } from './theme-toggle';
import { BrandMark, Wordmark } from './brand';

/**
 * The application shell.
 *
 * Rail, header, content. No hero, no marketing band, no onboarding overlay —
 * the first thing on screen is the market. Everything chrome-level is one line
 * tall so the content column starts within 50px of the top of the viewport.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => startTransport(), []);

  // The MSW layer answers any fetch a component makes while mocks are on. The
  // tick loop does not go through it, so a slow worker start never delays the
  // first frame.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_USE_MOCKS !== 'true') return;
    void import('@/mocks/browser').then(({ startMocks }) => startMocks()).catch(() => {
      // No worker installed (npx msw init public). Mock reads still come from
      // the local simulator, so the app is fully usable without it.
    });
  }, []);

  return (
    <div className="flex min-h-dvh bg-paper">
      <ServiceWorkerRegistrar />
      <NavRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-surface">
          <div className="flex h-12 items-center gap-3 border-b border-rule/[.13] px-3 sm:px-4">
            <div className="flex items-center gap-2 lg:hidden">
              <BrandMark size={17} />
              <Wordmark className="text-sm" />
            </div>

            <SimStatus className="hidden min-w-0 flex-1 overflow-x-auto no-scrollbar lg:flex" />
            <div className="flex-1 lg:hidden" />

            <div className="flex shrink-0 items-center gap-1">
              <ConnectionIndicator />
              <NotificationCenter />
              <ThemeToggle />
              <RoleSwitcher />
            </div>
          </div>
          <SlotRibbon />
          <div className="border-b border-rule/[.13] px-3 py-1.5 lg:hidden">
            <SimStatus className="overflow-x-auto no-scrollbar" />
          </div>
          <OfflineBanner />
        </header>

        <main
          id="content"
          className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-4 lg:px-6 lg:pb-8"
        >
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
