/**
 * GET/POST /api/push — store a PushSubscription / send a notification — Rahi, H17–H19.
 */
import { NextResponse } from 'next/server';
import type { NotificationPayload } from '@sunshare/shared';
import { getSessionUser } from '@/lib/session';
import { isPushConfigured, saveSubscription, sendToUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** Diya's service worker needs the public key before it can subscribe. */
export async function GET() {
  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'no active session' }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: 'push is not configured', detail: 'VAPID keys are not set' },
      { status: 503 },
    );
  }

  let body: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    notification?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Sending to yourself is how the demo proves push works on a real phone
  // without waiting for a trade to complete.
  if (body.notification) {
    const payload = body.notification as NotificationPayload;
    if (typeof payload.title !== 'string' || typeof payload.body !== 'string') {
      return NextResponse.json(
        { error: 'notification needs a title and body' },
        { status: 400 },
      );
    }

    const delivered = await sendToUser(user.id, payload);
    return NextResponse.json({ delivered });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;

  if (
    typeof endpoint !== 'string' ||
    typeof p256dh !== 'string' ||
    typeof auth !== 'string'
  ) {
    return NextResponse.json(
      { error: 'endpoint and keys.p256dh / keys.auth are required' },
      { status: 400 },
    );
  }

  await saveSubscription(user.id, endpoint, p256dh, auth);

  return NextResponse.json({ subscribed: true, userId: user.id }, { status: 201 });
}
