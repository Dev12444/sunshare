/**
 * Fake tick emitter — Diya, H3–H5.
 *
 * Replays fixtures/ticks.json on a loop so every dashboard shows moving numbers
 * with zero backend running. Dev replaces the fixture with a real capture from
 * the simulator at H4; the shape never changes, so nothing downstream breaks.
 *
 * Swap to the real socket by setting NEXT_PUBLIC_USE_MOCKS=false (see
 * hooks/use-ticks.ts). That flag is the whole integration switch.
 */
import type { Tick } from '@sunshare/shared';
import fixtures from './fixtures/ticks.json';

const FRAME_MS = 1000;

export function startFakeTicks(onTick: (t: Tick) => void): () => void {
  const frames = fixtures as unknown as Tick[];
  if (frames.length === 0) return () => {};

  let i = 0;
  onTick(frames[0]);

  const id = setInterval(() => {
    i = (i + 1) % frames.length;
    const frame = frames[i];
    // Keep wall-clock fresh so "last updated" labels look alive.
    onTick({ ...frame, tsReal: new Date().toISOString() });
  }, FRAME_MS);

  return () => clearInterval(id);
}
