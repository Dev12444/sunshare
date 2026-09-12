/**
 * Market slot derivation — Rahi, H3–H5.
 *
 * The engine's simulated clock is authoritative: its slot id is adopted
 * verbatim as the MarketSlot primary key, so a trade in the database and a
 * match in the engine are always talking about the same 15 minutes. Deriving a
 * second slot id from wall time is how the two end up disagreeing.
 */
import { SLOT_MINUTES } from '@sunshare/shared';
import { prisma } from './prisma';

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

export interface SlotWindow {
  id: string;
  startSim: Date;
  endSim: Date;
}

function floorToSlot(at: Date): Date {
  const start = new Date(at);
  start.setSeconds(0, 0);
  start.setMinutes(Math.floor(start.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES);
  return start;
}

function windowFrom(id: string, startSim: Date): SlotWindow {
  return {
    id,
    startSim,
    endSim: new Date(startSim.getTime() + SLOT_MINUTES * 60_000),
  };
}

/**
 * Only used when the engine is unreachable, so placing an order degrades
 * instead of failing. Matches the engine's id format so the two are at least
 * comparable in the logs.
 */
function wallClockSlot(): SlotWindow {
  const start = floorToSlot(new Date());
  return windowFrom(start.toISOString().slice(0, 16), start);
}

let cached: { at: number; slot: SlotWindow } | null = null;
const CACHE_MS = 1_000;

export async function currentSlot(): Promise<SlotWindow> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.slot;

  try {
    const res = await fetch(`${ENGINE}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });

    if (res.ok) {
      const { slotId, simTime } = (await res.json()) as {
        slotId: string;
        simTime: string;
      };
      const slot = windowFrom(slotId, floorToSlot(new Date(simTime)));
      cached = { at: Date.now(), slot };
      return slot;
    }
  } catch {
    // Engine down — fall through to wall clock.
  }

  return wallClockSlot();
}

/** Creates the slot row if this is the first order of the window. */
export async function ensureCurrentSlot(): Promise<SlotWindow> {
  const slot = await currentSlot();

  await prisma.marketSlot.upsert({
    where: { id: slot.id },
    update: {},
    create: { id: slot.id, startSim: slot.startSim, endSim: slot.endSim },
  });

  return slot;
}
