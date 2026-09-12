/**
 * Web push — Rahi + Diya, H17–H19.
 *
 * Triggers: the broker completes a sale, the community pool is funded, a badge
 * unlocks. The subscription itself is created in the browser by Diya's service
 * worker and posted here to be stored.
 */
import webpush from 'web-push';
import type { NotificationPayload } from '@sunshare/shared';
import { prisma } from './prisma';

let configured = false;

function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:team@sunshare.local';

  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

export async function saveSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
) {
  // Endpoint is unique: re-subscribing the same browser must move the
  // subscription to the current user rather than fail.
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth },
    create: { userId, endpoint, p256dh, auth },
  });
}

/**
 * Returns how many devices actually received it. Subscriptions the push
 * service rejects as gone are deleted — otherwise every later send retries a
 * dead endpoint and slows the whole batch down.
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
): Promise<number> {
  if (!ensureConfigured()) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      delivered += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
      } else {
        console.error(`push to ${userId} failed`, err);
      }
    }
  }

  return delivered;
}
