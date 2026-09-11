/**
 * Market slot derivation — Rahi, H3–H5.
 *
 * Listings and bids both hang off a MarketSlot row, so the slot has to exist
 * before the order does.
 */
import { SLOT_MINUTES } from '@sunshare/shared';
import { prisma } from './prisma';

/**
 * The simulated clock is Dev's, delivered over the engine tick stream. Until
 * that lands this tracks the wall clock, which keeps slots advancing so orders
 * can be placed. Point this at the tick's `tsSim` at integration and every
 * caller below follows.
 */
export function simNow(): Date {
  return new Date();
}

export interface SlotWindow {
  id: string;
  startSim: Date;
  endSim: Date;
}

/** Floors a timestamp onto the SLOT_MINUTES grid. */
export function slotWindowFor(at: Date): SlotWindow {
  const startSim = new Date(at);
  startSim.setSeconds(0, 0);
  startSim.setMinutes(Math.floor(startSim.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES);

  const endSim = new Date(startSim.getTime() + SLOT_MINUTES * 60_000);

  return { id: `slot-${startSim.toISOString().slice(0, 16)}`, startSim, endSim };
}

export function currentSlotWindow(): SlotWindow {
  return slotWindowFor(simNow());
}

/** Creates the slot row if this is the first order of the window. */
export async function ensureCurrentSlot(): Promise<SlotWindow> {
  const window = currentSlotWindow();

  await prisma.marketSlot.upsert({
    where: { id: window.id },
    update: {},
    create: { id: window.id, startSim: window.startSim, endSim: window.endSim },
  });

  return window;
}
