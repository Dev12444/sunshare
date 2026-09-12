'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bid, Listing, TariffContext } from '@sunshare/shared';
import { kwh, rupees } from '@/lib/format';
import { axisProps, useChartTheme } from './chart-theme';
import { ChartLegend, ChartTooltip } from './tooltip';

/**
 * Market depth.
 *
 * Asks accumulated ascending, bids accumulated descending. Where the two
 * curves cross is the clearing price, and the horizontal distance between them
 * at any price is the volume that would trade there. This is the auction made
 * visible — a judge can point at the crossing and read the price off the axis.
 */
export function DepthChart({
  listings,
  bids,
  tariff,
  clearingPricePaise,
  height = 168,
}: {
  listings: Listing[];
  bids: Bid[];
  tariff: TariffContext;
  clearingPricePaise: number | null;
  height?: number;
}) {
  const theme = useChartTheme();

  const data = useMemo(() => {
    const asks = [...listings].sort((a, b) => a.askPricePaise - b.askPricePaise);
    const offers = [...bids].sort((a, b) => b.maxPricePaise - a.maxPricePaise);

    const prices = new Set<number>([tariff.feedInTariffPaise, tariff.retailTariffPaise]);
    asks.forEach((a) => prices.add(a.askPricePaise));
    offers.forEach((b) => prices.add(b.maxPricePaise));

    return [...prices]
      .sort((a, b) => a - b)
      .map((p) => ({
        price: p / 100,
        supply: asks.filter((a) => a.askPricePaise <= p).reduce((s, a) => s + a.kwh, 0),
        demand: offers.filter((b) => b.maxPricePaise >= p).reduce((s, b) => s + b.kwh, 0),
      }));
  }, [listings, bids, tariff]);

  if (listings.length === 0 && bids.length === 0) {
    return (
      <p className="px-3.5 py-8 text-center text-sm text-ink-3">
        The book is empty for this slot. Depth appears as listings and bids arrive.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={theme.ink3} strokeOpacity={0.12} vertical={false} />
            <XAxis
              dataKey="price"
              type="number"
              domain={[tariff.feedInTariffPaise / 100, tariff.retailTariffPaise / 100]}
              {...axisProps(theme)}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <YAxis {...axisProps(theme)} width={42} tickFormatter={(v: number) => v.toFixed(1)} />
            <Line
              type="stepAfter"
              dataKey="supply"
              stroke={theme.solar}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="Cumulative supply"
            />
            <Line
              type="stepBefore"
              dataKey="demand"
              stroke={theme.mains}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="Cumulative demand"
            />
            {clearingPricePaise != null ? (
              <ReferenceLine
                x={clearingPricePaise / 100}
                stroke={theme.ink}
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: theme.ink3, strokeOpacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { supply: number; demand: number };
                return (
                  <ChartTooltip
                    title={`${rupees(Number(label) * 100)}/kWh`}
                    rows={[
                      { label: 'Supply at or below', value: `${kwh(p.supply)} kWh`, color: theme.solar },
                      { label: 'Demand at or above', value: `${kwh(p.demand)} kWh`, color: theme.mains },
                    ]}
                    footer={`Tradeable ${kwh(Math.min(p.supply, p.demand))} kWh`}
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2">
        <ChartLegend
          items={[
            { label: 'Cumulative supply', color: theme.solar },
            { label: 'Cumulative demand', color: theme.mains },
            ...(clearingPricePaise != null
              ? [{ label: `Clearing ${rupees(clearingPricePaise)}`, color: theme.ink, dashed: true }]
              : []),
          ]}
        />
      </figcaption>
    </figure>
  );
}
