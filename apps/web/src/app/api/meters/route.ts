/**
 * GET /api/meters — meter registry + latest reading per meter — Rahi, H3–H5.
 */
import { NextResponse } from 'next/server';
import type { MeterReading } from '@sunshare/shared';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Not in the shared treaty: the registry entry is a join of Meter and User that
 * only this route serves. Promote it to types.ts by team agreement if the
 * frontend ends up passing it around.
 */
interface MeterEntry {
  id: string;
  userId: string;
  userName: string;
  nodeId: string;
  panelKw: number;
  archetype: string;
  /** Null until the simulator starts writing readings. */
  latestReading: (MeterReading & { tsSim: string }) | null;
}

export async function GET() {
  const meters = await prisma.meter.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { id: 'asc' },
  });

  // DISTINCT ON (meterId) — one row per meter, newest first.
  const latest = await prisma.reading.findMany({
    where: { meterId: { in: meters.map((m) => m.id) } },
    distinct: ['meterId'],
    orderBy: [{ meterId: 'asc' }, { tsSim: 'desc' }],
  });

  const byMeter = new Map(latest.map((r) => [r.meterId, r]));

  const entries: MeterEntry[] = meters.map((meter) => {
    const reading = byMeter.get(meter.id);

    return {
      id: meter.id,
      userId: meter.userId,
      userName: meter.user.name,
      nodeId: meter.nodeId,
      panelKw: meter.panelKw,
      archetype: meter.archetype,
      latestReading: reading
        ? {
            meterId: meter.id,
            userId: meter.userId,
            nodeId: meter.nodeId,
            generationKw: reading.generationKw,
            consumptionKw: reading.consumptionKw,
            surplusKw: reading.surplusKw,
            dayGenerationKwh: reading.dayGenerationKwh,
            tsSim: reading.tsSim.toISOString(),
          }
        : null,
    };
  });

  return NextResponse.json(entries);
}
