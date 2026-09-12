/**
 * Fake event stream — Diya.
 *
 * Mirrors fake-ws.ts's pattern for the "everything that is not a tick"
 * channel (trade / settlement / broker / donation events — see ServerEvent
 * in @sunshare/shared and src/lib/sse.ts). Replays the demo day's trades and
 * broker decisions in chronological order so the Broker/Ledger/Community
 * pages see the same activity a real /api/events SSE stream would deliver.
 *
 * Swap to the real stream by setting NEXT_PUBLIC_USE_MOCKS=false — consumers
 * call subscribeToEvents() either way (see hooks that read USE_MOCKS).
 */
import type { ServerEvent } from '@sunshare/shared';
import { DEMO_DECISIONS, DEMO_DONATIONS, DEMO_TRADES, DEMO_RECEIPTS } from './scenario';

type Envelope = { tsSim: string; event: ServerEvent };

function buildTimeline(): Envelope[] {
  const events: Envelope[] = [];
  for (const d of DEMO_DECISIONS) events.push({ tsSim: d.tsSim, event: { type: 'broker', data: d } });
  for (const t of DEMO_TRADES) {
    events.push({ tsSim: t.createdAt, event: { type: 'trade', data: t } });
    const receipt = DEMO_RECEIPTS[t.id];
    if (receipt) events.push({ tsSim: receipt.settledAt, event: { type: 'settlement', data: receipt } });
  }
  for (const don of DEMO_DONATIONS) events.push({ tsSim: don.createdAt, event: { type: 'donation', data: don } });
  return events.sort((a, b) => a.tsSim.localeCompare(b.tsSim));
}

const TIMELINE = buildTimeline();

/** The day's full history, in order. Ticks (useTicks) already carry the
 *  continuously-live signal (price/generation every second); this backstory
 *  loads once rather than re-trickling on every page visit. */
export function replayedHistory(): ServerEvent[] {
  return TIMELINE.map((e) => e.event);
}
