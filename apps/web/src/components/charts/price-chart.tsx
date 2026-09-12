'use client';

import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TariffContext } from '@sunshare/shared';
import { kwh, rupees } from '@/lib/format';
import type { PricePoint } from '@/lib/mock/state-defaults';
import { axisProps, useChartTheme } from './chart-theme';
import { ChartLegend, ChartTooltip } from './tooltip';

/**
 * Clearing price per slot against the corridor.
 *
 * The two dashed rules are the floor and the ceiling, and the y-axis is fixed
 * to them: a price chart whose axis rescales to the data hides the single most
 * important fact about this market, which is how much headroom is left before
 * a trade stops being worth doing for one of the two parties.
 */
export function PriceChart({
  data,
  tariff,
  height = 200,
  showVolume = true,
}: {
  data: PricePoint[];
  tariff: TariffContext;
  height?: number;
  showVolume?: boolean;
}) {
  const theme = useChartTheme();
  const series = useMemo(
    () => data.map((d) => ({ ...d, price: d.clearingPricePaise / 100 })),
    [data],
  );
  const floor = tariff.feedInTariffPaise / 100;
  const ceiling = tariff.retailTariffPaise / 100;
  const maxVolume = Math.max(1, ...data.map((d) => d.volumeKwh));

  if (series.length === 0) {
    return (
      <p className="px-3.5 py-8 text-center text-sm text-ink-3">
        No slot has cleared yet today. The first price appears when the market closes its first
        15-minute slot.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: -14 }}>
            <CartesianGrid stroke={theme.ink3} strokeOpacity={0.13} vertical={false} />
            <XAxis dataKey="clock" {...axisProps(theme)} interval="preserveStartEnd" minTickGap={44} />
            <YAxis
              yAxisId="price"
              {...axisProps(theme)}
              width={40}
              domain={[floor, ceiling]}
              ticks={[floor, (floor + ceiling) / 2, ceiling]}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            {showVolume ? (
              <YAxis
                yAxisId="volume"
                orientation="right"
                hide
                domain={[0, maxVolume * 3.4]}
              />
            ) : null}

            <ReferenceLine
              yAxisId="price"
              y={ceiling}
              stroke={theme.down}
              strokeDasharray="4 3"
              strokeOpacity={0.75}
            />
            <ReferenceLine
              yAxisId="price"
              y={floor}
              stroke={theme.mains}
              strokeDasharray="4 3"
              strokeOpacity={0.75}
            />

            {showVolume ? (
              <Bar
                yAxisId="volume"
                dataKey="volumeKwh"
                fill={theme.ink3}
                fillOpacity={0.22}
                isAnimationActive={false}
                name="Volume"
              />
            ) : null}

            <Line
              yAxisId="price"
              type="stepAfter"
              dataKey="price"
              stroke={theme.solar}
              strokeWidth={1.7}
              dot={false}
              isAnimationActive={false}
              name="Clearing price"
            />

            <Tooltip
              cursor={{ stroke: theme.ink3, strokeOpacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as PricePoint;
                return (
                  <ChartTooltip
                    title={`Slot ${String(label)}`}
                    rows={[
                      {
                        label: 'Clearing',
                        value: `${rupees(p.clearingPricePaise)}/kWh`,
                        color: theme.solar,
                      },
                      { label: 'Volume', value: `${kwh(p.volumeKwh)} kWh`, color: theme.ink3 },
                      {
                        label: 'Buyer saves',
                        value: `${rupees(tariff.retailTariffPaise - p.clearingPricePaise)}/kWh`,
                      },
                    ]}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2">
        <ChartLegend
          items={[
            { label: 'Clearing price', color: theme.solar },
            { label: `Retail ceiling ${rupees(tariff.retailTariffPaise)}`, color: theme.down, dashed: true },
            { label: `Feed-in floor ${rupees(tariff.feedInTariffPaise)}`, color: theme.mains, dashed: true },
            ...(showVolume ? [{ label: 'Volume', color: theme.ink3 }] : []),
          ]}
        />
      </figcaption>
    </figure>
  );
}
