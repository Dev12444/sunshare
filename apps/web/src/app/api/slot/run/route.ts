/**
 * POST /api/slot/run — run one slot end to end — Rahi, H13–H15.
 *
 * Triggered rather than timer-driven so the demo runs a slot on cue instead of
 * whenever a 15-minute boundary happens to arrive.
 */
import { NextResponse } from 'next/server';
import { runSlot } from '@/lib/orchestrator';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Running a slot clears the market and settles every trade in it on chain,
  // so it needs a signed-in operator rather than anyone with the URL.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'no active session' }, { status: 401 });
  }

  // An explicit slotId lets the demo re-run a specific window; omitted, the
  // orchestrator picks the current slot or the most recent one with a book.
  let slotId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.slotId === 'string') slotId = body.slotId;
  } catch {
    // No body is the normal case.
  }

  try {
    return NextResponse.json(await runSlot(slotId));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('slot run failed', err);
    return NextResponse.json({ error: 'slot run failed', detail }, { status: 502 });
  }
}
