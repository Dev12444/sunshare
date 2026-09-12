/**
 * POST /api/slot/run — run one slot end to end — Rahi, H13–H15.
 *
 * Triggered rather than timer-driven so the demo runs a slot on cue instead of
 * whenever a 15-minute boundary happens to arrive.
 */
import { NextResponse } from 'next/server';
import { runSlot } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json(await runSlot());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('slot run failed', err);
    return NextResponse.json({ error: 'slot run failed', detail }, { status: 502 });
  }
}
