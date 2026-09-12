'use client';

/**
 * Carbon Impact — Diya, H9–H12.
 *
 * Totals and badge progress load from GET /api/carbon (Rahi), which counts
 * network CO2 off Trade rather than the ledger so neither side of a trade is
 * double counted. Trades arriving on the live stream top the figures up
 * between loads, so the number moves during a demo without a refetch.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Badge, CarbonSummary, TradeRecord } from '@sunshare/shared';
import { GRID_EMISSION_FACTOR, TD_LOSS_FRACTION } from '@sunshare/shared';
import { useActivity } from '@/hooks/use-activity';
import { DEMO_USER_ID } from '@/mocks/scenario';
import { LifecycleRail } from '@/components/lifecycle-rail';

/** GET /api/carbon — see apps/web/src/app/api/carbon/route.ts. */
type CarbonResponse = {
  summary: CarbonSummary;
  badges: Badge[];
  networkCo2AvoidedKg: number;
};

export default function ImpactPage() {
  const { events } = useActivity();
  const [data, setData] = useState<CarbonResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/carbon?userId=${encodeURIComponent(DEMO_USER_ID)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: CarbonResponse) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Trades streamed after the fetch, so the counters keep climbing live. */
  const streamedSinceLoad = useMemo(() => {
    if (!data) return { kwh: 0, co2: 0 };
    const seen = new Set<string>();
    let kwh = 0;
    let co2 = 0;
    for (const e of events) {
      if (e.type !== 'trade') continue;
      const t: TradeRecord = e.data;
      if (t.sellerId !== data.summary.userId || seen.has(t.id)) continue;
      if (new Date(t.createdAt) <= new Date(data.summary.periodEnd)) continue;
      seen.add(t.id);
      kwh += t.deliveredKwh;
      co2 += t.co2AvoidedKg;
    }
    return { kwh, co2 };
  }, [events, data]);

  if (error) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Carbon Impact</h1>
        <p className="tile text-sm text-grid-400">
          Impact figures are unavailable right now. Your settled trades are unaffected —
          this page will fill in once the service responds.
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Carbon Impact</h1>
        <div className="chip-neutral">Loading impact data…</div>
      </section>
    );
  }

  const summary = data.summary;
  const badges = data.badges;
  const localKwh = summary.localKwh + streamedSinceLoad.kwh;
  const co2AvoidedKg = summary.co2AvoidedKg + streamedSinceLoad.co2;
  const transmissionLossAvoidedKwh = Math.round(localKwh * TD_LOSS_FRACTION * 1000) / 1000;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Carbon Impact</h1>
        <LifecycleRail current="IMPACT" className="hidden sm:flex" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="CO₂ avoided" value={`${co2AvoidedKg.toFixed(2)} kg`} />
        <Metric label="Local kWh traded" value={`${localKwh.toFixed(2)} kWh`} />
        <Metric label="Transmission loss avoided" value={`${transmissionLossAvoidedKwh.toFixed(3)} kWh`} />
        <Metric label="Tree-year equivalent" value={summary.treeEquivalent.toFixed(1)} />
      </div>

      <p className="text-xs text-grid-400">
        Grid comparison uses the CEA baseline of {GRID_EMISSION_FACTOR} kg CO₂/kWh for the
        Indian grid average, net of solar lifecycle emissions and avoided T&amp;D loss.
        Across the whole network today: {data.networkCo2AvoidedKg.toFixed(2)} kg avoided.
      </p>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grid-400">Badges</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {badges.map((b) => (
            <div
              key={b.code}
              className={
                'tile text-center ' + (b.unlockedAt ? '' : 'opacity-50 grayscale')
              }
            >
              <div className="text-2xl" aria-hidden>{b.icon}</div>
              <div className="mt-1 text-xs font-medium">{b.title}</div>
              <div className="mt-1 h-1 rounded-full bg-grid-400/20">
                <div
                  className="h-1 rounded-full bg-sun-500"
                  style={{ width: `${b.progressPct}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-grid-400">{b.progressPct}%</div>
            </div>
          ))}
        </div>
      </div>

      <ShareCard
        userId={summary.userId}
        co2={co2AvoidedKg}
        kwh={localKwh}
        trees={summary.treeEquivalent}
      />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="text-[11px] uppercase tracking-wide text-grid-400">{label}</div>
      <div className="figure mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ShareCard({ userId, co2, kwh, trees }: { userId: string; co2: number; kwh: number; trees: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const W = 600;
    const H = 315;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '600 14px monospace';
    ctx.fillText('SUNSHARE · IMPACT', 28, 40);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(userId, 28, 58);

    const stats: [string, string][] = [
      ['CO2 AVOIDED', `${co2.toFixed(1)} kg`],
      ['LOCAL KWH TRADED', `${kwh.toFixed(1)} kWh`],
      ['TREE-YEAR EQUIV.', trees.toFixed(1)],
    ];
    stats.forEach(([label, value], i) => {
      const y = 110 + i * 62;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText(label, 28, y);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '600 28px monospace';
      ctx.fillText(value, 28, y + 30);
    });

    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.fillText('Verified against locally settled trades — sunshare.local', 28, H - 20);
  }, [userId, co2, kwh, trees]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `sunshare-impact-${userId}.png`;
    a.click();
  }

  return (
    <div className="tile">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grid-400">
        Shareable impact card
      </h2>
      <canvas ref={canvasRef} className="w-full max-w-md rounded border border-black/10 dark:border-white/10" />
      <button
        type="button"
        onClick={download}
        className="mt-3 rounded border border-sun-600/40 px-3 py-1.5 text-xs font-medium text-sun-600
                   hover:bg-sun-500/10 dark:text-sun-400"
      >
        Save image
      </button>
    </div>
  );
}
