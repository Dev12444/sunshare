'use client';

import { useCallback, useEffect, useState } from 'react';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'requesting';

/**
 * Web push opt-in.
 *
 * Asked for from a button the user pressed, never on page load — a permission
 * prompt that appears unprompted is refused by reflex and can never be asked
 * again. The subscription is handed to /api/push, which stores it; the service
 * worker renders whatever the server later sends.
 */
export function usePushNotifications() {
  const [state, setState] = useState<PushState>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }
    setState(Notification.permission as PushState);
  }, []);

  const enable = useCallback(async () => {
    if (!('Notification' in window)) return;
    setState('requesting');

    const permission = await Notification.requestPermission();
    setState(permission as PushState);
    if (permission !== 'granted') return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        ...(key ? { applicationServerKey: urlBase64ToUint8Array(key) } : {}),
      });
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
    } catch {
      // No VAPID key configured, or the browser refused the subscription. The
      // permission still stands and in-app notifications are unaffected.
    }
  }, []);

  return { state, enable };
}

/**
 * VAPID keys are distributed base64url-encoded; the Push API wants the raw
 * bytes. Backed by an explicit ArrayBuffer so the result is the exact
 * `BufferSource` shape `pushManager.subscribe` accepts.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
