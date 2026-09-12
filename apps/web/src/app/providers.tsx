'use client';

/**
 * App providers — Diya.
 *
 * Starts the MSW worker (src/mocks/browser.ts) before rendering the
 * dashboard, so the very first fetch from any page — engine.carbon(),
 * /api/community, etc. — is already intercepted. Without this the worker
 * never starts and every mocked page silently 404s. No-ops entirely when
 * NEXT_PUBLIC_USE_MOCKS is not 'true'.
 */
import { useEffect, useState } from 'react';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!USE_MOCKS);

  useEffect(() => {
    if (!USE_MOCKS) return;
    let cancelled = false;
    void import('@/mocks/browser').then(({ startMocks }) =>
      startMocks().finally(() => {
        if (!cancelled) setReady(true);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-grid-400">
        Starting demo simulation…
      </div>
    );
  }

  return <>{children}</>;
}
