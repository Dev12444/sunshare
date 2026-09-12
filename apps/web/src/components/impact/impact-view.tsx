'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BADGE_DEFINITIONS, TD_LOSS_FRACTION } from '@sunshare/shared';
import { axisProps, useChartTheme } from '@/components/charts/chart-theme';
import { ChartTooltip } from '@/components/charts/tooltip';
import { Button, SegmentedControl } from '@/components/ui/controls';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { MeterBar, Tag } from '@/components/ui/tag';
import { co2AvoidedKg, gridEnergyDisplaced, treeEquivalent } from '@/lib/domain';
import { kgCo2, kwh, pct, rupees } from '@/lib/format';
import { useStore } from '@/lib/store';
import { useDayLedger, useNetworkLedger } from '@/hooks/use-derived';

/**
 * Recorded impact for the days before the simulated one.
 *
 * Seven weekdays of the pilot, so the chart is a record rather than a single
 * bar. Sunday is low because the school and the shop are shut and there is
 * almost no midday demand to match against.
 */
const PRIOR_DAYS = [
  { label: 'Sat 06', kwh: 21.4 },
  { label: 'Sun 07', kwh: 9.8 },
  { label: 'Mon 08', kwh: 27.1 },
  { label: 'Tue 09', kwh: 29.6 },
  { label: 'Wed 10', kwh: 24.3 },
  { label: 'Thu 11', kwh: 31.2 },
];

type Scope = 'me' | 'network';

/**
 * Impact.
 *
 * Carbon is the headline, but the number that convinces an engineer is
 * transmission loss avoided — energy that never had to travel from a central
 * plant through the T&D system to get here. Badges exist, quietly, as a
 * progress register rather than a trophy cabinet.
 */
export function ImpactView() {
  const user = useStore((s) => s.user);
  const mine = useDayLedger();
  const network = useNetworkLedger();
  const theme = useChartTheme();
  const [scope, setScope] = useState<Scope>('me');
  const [shareState, setShareState] = useState<'idle' | 'done' | 'error'>('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const localKwh = scope === 'me' ? mine.soldDeliveredKwh + mine.boughtKwh : network.deliveredKwh;
  const co2 = scope === 'me' ? mine.co2Kg : network.co2Kg;
  const displaced = gridEnergyDisplaced(localKwh);
  const lossAvoided = Math.max(0, localKwh * TD_LOSS_FRACTION - (scope === 'me' ? 0 : network.lossKwh));
  const trees = treeEquivalent(co2);

  const series = useMemo(
    () => [
      ...PRIOR_DAYS.map((d) => ({ ...d, co2: co2AvoidedKg(d.kwh), today: false })),
      { label: 'Fri 12', kwh: network.deliveredKwh, co2: network.co2Kg, today: true },
    ],
    [network.deliveredKwh, network.co2Kg],
  );

  const badgeProgress = useMemo(() => {
    const soldKwh = mine.soldDeliveredKwh;
    const localTraded = mine.soldDeliveredKwh + mine.boughtKwh;
    const measures: Record<string, { value: number; unit: string }> = {
      FIRST_TRADE: { value: mine.trades.length, unit: 'trades' },
      LOCAL_10: { value: localTraded, unit: 'kWh' },
      SUN_BARON: { value: soldKwh, unit: 'kWh' },
      COMMUNITY_HERO: { value: mine.donatedKwh, unit: 'kWh' },
      CARBON_CENTURY: { value: mine.co2Kg, unit: 'kg' },
    };
    return BADGE_DEFINITIONS.map((b) => {
      const m = measures[b.code] ?? { value: 0, unit: '' };
      return {
        ...b,
        measured: m.value,
        unit: m.unit,
        progress: Math.max(0, Math.min(1, m.value / b.threshold)),
        unlocked: m.value >= b.threshold,
      };
    });
  }, [mine]);

  function shareCard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setShareState('error');
      return;
    }

    const W = 1200;
    const H = 630;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = '#14120f';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(242,237,228,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(48.5, 48.5, W - 97, H - 97);

    ctx.fillStyle = '#f0a527';
    ctx.fillRect(96, 118, 46, 3);

    ctx.fillStyle = '#f2ede4';
    ctx.font = '600 30px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillText('SunShare', 96, 108);

    ctx.fillStyle = '#a79e90';
    ctx.font = '400 20px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillText('Sector 21, Gandhinagar · local solar market', 96, 156);

    const stats: [string, string][] = [
      ['CO₂ AVOIDED', kgCo2(co2)],
      ['TRADED LOCALLY', `${kwh(localKwh)} kWh`],
      ['GRID DISPLACED', `${kwh(displaced)} kWh`],
      ['TREE EQUIVALENT', trees.toFixed(1)],
    ];

    stats.forEach(([label, value], i) => {
      const x = 96 + (i % 2) * 520;
      const y = 260 + Math.floor(i / 2) * 150;
      ctx.fillStyle = '#776f63';
      ctx.font = '600 15px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillText(label, x, y);
      ctx.fillStyle = i === 0 ? '#f0a527' : '#f2ede4';
      ctx.font = '500 58px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(value, x, y + 62);
    });

    ctx.fillStyle = '#776f63';
    ctx.font = '400 17px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillText(
      `${scope === 'me' ? user.name : 'Neighbourhood total'} · 12 September 2026`,
      96,
      H - 96,
    );

    canvas.toBlob((blob) => {
      if (!blob) {
        setShareState('error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sunshare-impact-${scope}-2026-09-12.png`;
      a.click();
      URL.revokeObjectURL(url);
      setShareState('done');
      setTimeout(() => setShareState('idle'), 2600);
    }, 'image/png');
  }

  return (
    <div className="space-y-4">
      <PageHead
        stage="IMPACT"
        title="Impact"
        subtitle="Emissions avoided and network losses saved by matching energy locally instead of importing it"
        aside={
          <div className="flex items-center gap-2">
            <SegmentedControl
              size="sm"
              label="Scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'me', label: 'You' },
                { value: 'network', label: 'Neighbourhood' },
              ]}
            />
            <Button size="sm" onClick={shareCard}>
              {shareState === 'done' ? 'Card saved' : 'Export impact card'}
            </Button>
          </div>
        }
      />

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric
              label="CO₂ avoided"
              value={kgCo2(co2)}
              tone="up"
              size="lg"
              hint="Against Indian grid average, net of solar lifecycle"
            />
          </MetricCell>
          <MetricCell>
            <Metric label="Traded locally" value={kwh(localKwh)} unit="kWh" hint="Delivered peer to peer" />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Grid energy displaced"
              value={kwh(displaced)}
              unit="kWh"
              hint={`Includes ${pct(TD_LOSS_FRACTION * 100, 0)} T&D losses`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Transmission loss avoided"
              value={kwh(lossAvoided)}
              unit="kWh"
              tone="solar"
              hint="Net of local line losses"
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Tree equivalent"
              value={trees.toFixed(1)}
              unit="tree-years"
              hint="At 21 kg CO₂ per urban tree per year"
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead title="Locally traded energy" meta="Neighbourhood, last seven days" />
            <PanelBody>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={theme.ink3} strokeOpacity={0.13} vertical={false} />
                    <XAxis dataKey="label" {...axisProps(theme)} />
                    <YAxis {...axisProps(theme)} width={42} tickFormatter={(v: number) => v.toFixed(0)} />
                    <Bar
                      dataKey="kwh"
                      isAnimationActive={false}
                      fill={theme.solar}
                      fillOpacity={0.75}
                      radius={[1, 1, 0, 0]}
                    />
                    <Tooltip
                      cursor={{ fill: theme.ink3, fillOpacity: 0.08 }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as { kwh: number; co2: number; today: boolean };
                        return (
                          <ChartTooltip
                            title={String(label)}
                            rows={[
                              { label: 'Traded', value: `${kwh(p.kwh)} kWh`, color: theme.solar },
                              { label: 'CO₂ avoided', value: kgCo2(p.co2) },
                            ]}
                            footer={p.today ? 'Today, still trading' : undefined}
                          />
                        );
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-ink-3">
                Sunday is low because the school and the general store are closed — without midday
                commercial demand there is very little surplus worth matching.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="How this is calculated" />
            <PanelBody>
              <dl>
                <DataRow label="Grid emission factor">0.71 kg CO₂/kWh</DataRow>
                <DataRow label="Rooftop solar lifecycle">0.04 kg CO₂/kWh</DataRow>
                <DataRow label="T&D losses avoided">{pct(TD_LOSS_FRACTION * 100, 0)}</DataRow>
                <DataRow label="Net avoided per kWh">
                  {(0.71 - 0.04) * (1 + TD_LOSS_FRACTION) > 0
                    ? `${((0.71 - 0.04) * (1 + TD_LOSS_FRACTION)).toFixed(3)} kg`
                    : '—'}
                </DataRow>
                <DataRow label="Source" mono={false}>
                  CEA CO₂ Baseline Database, Indian grid average
                </DataRow>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-2">
                Avoided emissions are counted on delivered energy, not contracted energy — a
                kilowatt-hour lost in the line displaced nothing. Local trading also avoids the
                transmission and distribution losses a central plant would have incurred reaching
                the same meter, which is why displaced grid energy exceeds the energy traded.
              </p>
            </PanelBody>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead
              title="Progression"
              meta={`${badgeProgress.filter((b) => b.unlocked).length} of ${badgeProgress.length}`}
            />
            <ul className="hair-y">
              {badgeProgress.map((b) => (
                <li key={b.code} className="px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={
                        b.unlocked ? 'text-sm font-medium text-ink' : 'text-sm text-ink-2'
                      }
                    >
                      {b.title}
                    </span>
                    {b.unlocked ? (
                      <Tag tone="up">Unlocked</Tag>
                    ) : (
                      <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
                        {b.measured.toFixed(b.unit === 'trades' ? 0 : 1)} / {b.threshold} {b.unit}
                      </span>
                    )}
                  </div>
                  <MeterBar
                    value={b.progress}
                    tone={b.unlocked ? 'up' : 'solar'}
                    className="mt-1.5"
                    ariaLabel={`${b.title} progress`}
                  />
                  <p className="mt-1 text-xs text-ink-3">{b.description}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHead title="Impact card" />
            <PanelBody className="space-y-3">
              <p className="text-xs leading-relaxed text-ink-2">
                Generates a 1200×630 PNG of the figures above for{' '}
                {scope === 'me' ? 'your account' : 'the whole neighbourhood'}, sized for sharing.
                Nothing is uploaded — the file is drawn in the browser and saved locally.
              </p>
              <Button variant="primary" onClick={shareCard}>
                {shareState === 'done' ? 'Saved to downloads' : 'Export impact card'}
              </Button>
              {shareState === 'error' ? (
                <p className="text-xs text-down">
                  Could not draw the card in this browser. The figures above are unaffected.
                </p>
              ) : null}
              <canvas ref={canvasRef} className="hidden" aria-hidden />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Network total" meta="All twelve premises" />
            <PanelBody>
              <dl>
                <DataRow label="Trades settled">{network.trades - network.failed}</DataRow>
                <DataRow label="Energy delivered">{kwh(network.deliveredKwh)} kWh</DataRow>
                <DataRow label="Line losses" tone="warn">
                  {kwh(network.lossKwh)} kWh
                </DataRow>
                <DataRow label="Grid backfill">{kwh(network.backfillKwh)} kWh</DataRow>
                <DataRow label="Market value">{rupees(network.grossPaise)}</DataRow>
                <DataRow label="CO₂ avoided" tone="up">
                  {kgCo2(network.co2Kg)}
                </DataRow>
              </dl>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
