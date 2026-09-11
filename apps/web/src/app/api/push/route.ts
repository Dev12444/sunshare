/**
 * POST /api/push — store a PushSubscription / send a notification — Rahi, H17–H19.
 */
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // TODO(Diya + Rahi): web-push with VAPID keys.
  // Triggers: broker sale completed, community pool funded, badge unlocked.
  void req;
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
