/**
 * Meter reading snapshots — Rahi.
 *
 * The engine streams ticks but persists nothing, so the database only learns
 * what a meter did if this service writes it down. Snapshotting on each slot
 * run is enough for everything that reads history — the dashboards take live
 * numbers straight off the engine WebSocket, not from here.
 */
import type { MeterReading } from '@sunshare/shared';
import { prisma } from './prisma';

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

export async function fetchReadings(): Promise<MeterReading[]> {
  const res = await fetch(`${ENGINE}/meters`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`engine /meters -> ${res.status}`);
  return res.json() as Promise<MeterReading[]>;
}

/**
 * Writes one row per meter and returns what it wrote, so a caller that needs
 * day-generation totals does not have to read them back.
 */
export async function snapshotReadings(tsSim: Date): Promise<MeterReading[]> {
  const readings = await fetchReadings();

  // Meters the engine knows about but the DB does not would violate the FK;
  // the seed is built from the same file, so this only bites on a stale DB.
  const known = new Set(
    (await prisma.meter.findMany({ select: { id: true } })).map((m) => m.id),
  );
  const writable = readings.filter((r) => known.has(r.meterId));

  if (writable.length > 0) {
    await prisma.reading.createMany({
      data: writable.map((r) => ({
        meterId: r.meterId,
        tsSim,
        generationKw: r.generationKw,
        consumptionKw: r.consumptionKw,
        surplusKw: r.surplusKw,
        dayGenerationKwh: r.dayGenerationKwh,
      })),
    });
  }

  return writable;
}
