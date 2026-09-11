/**
 * GET /api/events — SSE stream of everything that is not a tick — Rahi, H4–H6.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // TODO(Rahi): ReadableStream emitting ServerEvent JSON as `data:` frames.
  // Ticks do NOT come through here — the browser reads those straight off the
  // engine WebSocket. This carries trade / settlement / broker / donation / badge.
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
