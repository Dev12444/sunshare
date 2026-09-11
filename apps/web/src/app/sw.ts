/// <reference lib="webworker" />
/**
 * SunShare service worker — Diya, H1–H3.
 *
 * Caching strategy, decided at H0:
 *   app shell      -> precache (Serwist injects the manifest)
 *   GET /api/*     -> stale-while-revalidate, so the dashboard paints instantly
 *   market state   -> network-first, because a stale price is a wrong price
 *   navigations    -> network-first, falling back to /offline
 *
 * NOTE: the engine WebSocket is NOT intercepted by a service worker, so live
 * ticks are unaffected by any of this. Offline numbers come from IndexedDB
 * (see src/lib/offline-store.ts).
 */
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/market'),
      handler: new NetworkFirst({
        cacheName: 'market-state',
        networkTimeoutSeconds: 3,
      }),
    },
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith('/api/') && request.method === 'GET',
      handler: new StaleWhileRevalidate({ cacheName: 'api-get' }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

/* ---- Web push (Diya, H17–H19) ------------------------------------------ */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json() as {
    title: string;
    body: string;
    url: string;
    tag: string;
    icon: string;
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? '/prosumer';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});

serwist.addEventListeners();
