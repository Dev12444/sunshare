/**
 * Tick emitter for the mock transport.
 *
 * Generates frames from the same deterministic market engine the rest of the
 * mock layer uses, rather than replaying a captured fixture — so the clock can
 * be jumped, paused and re-seeded and the numbers stay consistent with the
 * order book and the ledger.
 *
 * `useTicks()` reads this when NEXT_PUBLIC_USE_MOCKS=true and the engine
 * WebSocket when it is false. That flag is the whole integration switch.
 */
import type { Tick } from '@sunshare/shared';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  DEFAULT_DONATION,
  DEFAULT_START_MIN,
  tickAt,
} from '@/lib/mock/market-engine';

const FRAME_MS = 1000;

export function startFakeTicks(
  onTick: (t: Tick) => void,
  options: { startMinutes?: number; speed?: number } = {},
): () => void {
  let minutes = options.startMinutes ?? DEFAULT_START_MIN;
  const speed = options.speed ?? 1;
  let seq = 0;

  const emit = () => {
    const { tick } = tickAt(minutes, ++seq, speed, [], null, DEFAULT_DONATION);
    onTick(tick);
  };

  emit();
  const id = setInterval(() => {
    minutes += speed;
    if (minutes > DAY_END_MIN) minutes = DAY_START_MIN;
    emit();
  }, FRAME_MS);

  return () => clearInterval(id);
}
