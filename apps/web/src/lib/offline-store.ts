/**
 * Offline market snapshot — Diya, H5–H6.5.
 *
 * The service worker can cache API responses, but the dashboard also needs to
 * render *something real* when the app is opened with no network at all. We
 * keep the last MarketState and the last tick's meter readings in IndexedDB and
 * paint them behind an "as of HH:MM" banner.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { MarketState, MeterReading } from '@sunshare/shared';

const DB_NAME = 'sunshare';
const STORE = 'snapshot';

type Snapshot = {
  market: MarketState;
  meters: MeterReading[];
  savedAt: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export async function saveSnapshot(
  market: MarketState,
  meters: MeterReading[],
): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE, { market, meters, savedAt: new Date().toISOString() }, 'latest');
  } catch {
    // Private browsing / storage denied — offline view degrades, app still works.
  }
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const d = await db();
    return (await d.get(STORE, 'latest')) ?? null;
  } catch {
    return null;
  }
}
