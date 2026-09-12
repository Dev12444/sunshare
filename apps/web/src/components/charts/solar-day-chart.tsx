'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { kw } from '@/lib/format';
import type { DayPoint } from '@/lib/mock/state-defaults';
import { axisProps, useChartTheme } from './chart-theme';
import { ChartLegend, ChartTooltip } from './tooltip';

/**
 * The solar day.
 *
 * Generation as a filled area because it is a quantity produced; consumption
 * as a line over it because it is a constraint the generation has to clear;
 * the gap between them is the surplus, which is the only part of this chart
 * that is worth money. Everything past the current tick is drawn muted — it is
 * a forecast, and a chart that hides that is lying.
 */
export function SolarDayChart({
  data,
  nowMinute,
  height = 240,
  showConsumption = true,
  ariaLabel,
}: {
  data: DayPoint[];
  nowMinute: number;
  height?: number;
  showConsumption?: boolean;
  ariaLabel?: string;
}) {
  const theme = useChartTheme();

  const { series, peak, current } = useMemo(() => {
    const series = data.map((d) => ({
      ...d,
      generationPast: d.minute <= nowMinute ? d.generationKw : null,
      generationAhead: d.minute >= nowMinute ? d.generationKw : null,
      consumptionPast: d.minute <= nowMinute ? d.consumptionKw : null,
      consumptionAhead: d.minute >= nowMinute ? d.consumptionKw : null,
    }));
    const peak = data.reduce((m, d) => Math.max(m, d.generationKw, d.consumptionKw), 0);
    // data[0] is the seed, so an empty series reduces to undefined rather than
    // throwing here — it throws later at current.clock. The DISCOM screen
    // prerenders before the store has any readings, which is exactly that
    // case, so the markers below are guarded instead of assumed.
    const current = data.length
      ? data.reduce(
          (best, d) =>
            Math.abs(d.minute - nowMinute) < Math.abs(best.minute - nowMinute) ? d : best,
          data[0],
        )
      : undefined;
    return { series, peak, current };
  }, [data, nowMinute]);

  const nowClock = `${String(Math.floor(nowMinute / 60)).padStart(2, '0')}:${String(
    Math.floor(nowMinute % 60),
  ).padStart(2, '0')}`;

  return (
    <figure className="m-0">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="gen-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.solar} stopOpacity={0.28} />
                <stop offset="100%" stopColor={theme.solar} stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={theme.ink3} strokeOpacity={0.14} vertical={false} />

            {/* The part of the day that has not happened yet. */}
            {current && (
              <ReferenceArea
                x1={current.clock}
                x2={series[series.length - 1]?.clock}
                fill={theme.ink3}
                fillOpacity={0.05}
                strokeOpacity={0}
              />
            )}

            <XAxis
              dataKey="clock"
              {...axisProps(theme)}
              interval="preserveStartEnd"
              minTickGap={44}
            />
            <YAxis
              {...axisProps(theme)}
              width={44}
              domain={[0, Math.ceil(peak * 1.12)]}
              tickFormatter={(v: number) => v.toFixed(0)}
            />

            <Area
              type="monotone"
              dataKey="generationPast"
              stroke={theme.solar}
              strokeWidth={1.6}
              fill="url(#gen-fill)"
              isAnimationActive={false}
              connectNulls
              name="Generation"
            />
            <Area
              type="monotone"
              dataKey="generationAhead"
              stroke={theme.solar}
              strokeWidth={1.2}
              strokeDasharray="3 3"
              fill="url(#gen-fill)"
              fillOpacity={0.35}
              isAnimationActive={false}
              connectNulls
              name="Forecast generation"
            />

            {showConsumption ? (
              <>
                <Line
                  type="monotone"
                  dataKey="consumptionPast"
                  stroke={theme.mains}
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                  name="Consumption"
                />
                <Line
                  type="monotone"
                  dataKey="consumptionAhead"
                  stroke={theme.mains}
                  strokeWidth={1.1}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                  name="Forecast consumption"
                />
              </>
            ) : null}

            <ReferenceLine
              x={current?.clock}
              stroke={theme.ink}
              strokeWidth={1}
              label={{
                value: nowClock,
                position: 'top',
                fill: theme.ink,
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            />

            <Tooltip
              cursor={{ stroke: theme.ink3, strokeOpacity: 0.4, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as DayPoint;
                const surplus = point.surplusKw;
                return (
                  <ChartTooltip
                    title={String(label)}
                    rows={[
                      { label: 'Generation', value: `${kw(point.generationKw)} kW`, color: theme.solar },
                      { label: 'Consumption', value: `${kw(point.consumptionKw)} kW`, color: theme.mains },
                      {
                        label: surplus >= 0 ? 'Surplus' : 'Import',
                        value: `${kw(Math.abs(surplus))} kW`,
                        color: surplus >= 0 ? theme.up : theme.down,
                      },
                    ]}
                    footer={`Cloud cover ${point.cloudCoverPct.toFixed(0)}%`}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <ChartLegend
          items={[
            { label: 'Generation', color: theme.solar },
            ...(showConsumption ? [{ label: 'Consumption', color: theme.mains }] : []),
            { label: 'Forecast', color: theme.ink3, dashed: true },
          ]}
        />
        <span className="sr-only">
          {ariaLabel ??
            (current
              ? `Solar day curve. At ${nowClock} generation is ${kw(current.generationKw)} kilowatts and consumption is ${kw(current.consumptionKw)} kilowatts.`
              : 'Solar day curve. No readings for this day yet.')}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Surplus alone, signed. Positive is energy available to sell, negative is
 * energy the household is importing.
 */
export function SurplusStrip({
  data,
  nowMinute,
  height = 96,
}: {
  data: DayPoint[];
  nowMinute: number;
  height?: number;
}) {
  const theme = useChartTheme();
  const series = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        positive: d.surplusKw > 0 ? d.surplusKw : 0,
        negative: d.surplusKw < 0 ? d.surplusKw : 0,
      })),
    [data],
  );
  // Snap the marker to a real category value; a category axis cannot place a
  // reference line at a label that is not in the data.
  const nowClock = series.reduce(
    (best, d) => (Math.abs(d.minute - nowMinute) < Math.abs(best.minute - nowMinute) ? d : best),
    series[0],
  )?.clock;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 4, right: 16, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={theme.ink3} strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="clock" {...axisProps(theme)} interval="preserveStartEnd" minTickGap={50} />
          <YAxis {...axisProps(theme)} width={44} tickFormatter={(v: number) => v.toFixed(0)} />
          <ReferenceLine y={0} stroke={theme.ink3} strokeOpacity={0.5} />
          <Area
            type="monotone"
            dataKey="positive"
            stroke={theme.up}
            strokeWidth={1.2}
            fill={theme.up}
            fillOpacity={0.16}
            isAnimationActive={false}
            name="Surplus"
          />
          <Area
            type="monotone"
            dataKey="negative"
            stroke={theme.down}
            strokeWidth={1.2}
            fill={theme.down}
            fillOpacity={0.14}
            isAnimationActive={false}
            name="Import"
          />
          <ReferenceLine x={nowClock} stroke={theme.ink} strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: theme.ink3, strokeOpacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as DayPoint;
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: p.surplusKw >= 0 ? 'Surplus' : 'Import',
                      value: `${kw(Math.abs(p.surplusKw))} kW`,
                      color: p.surplusKw >= 0 ? theme.up : theme.down,
                    },
                  ]}
                />
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
