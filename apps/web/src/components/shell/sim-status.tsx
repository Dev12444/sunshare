'use client';

import { DEFAULT_TARIFF } from '@sunshare/shared';
import { pct, rupees, simClock, slotLabel } from '@/lib/format';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/**
 * The simulated clock and the market's current state.
 *
 * It sits in the header at the size of a status line, not a hero. The point is
 * that a glance answers "what time is it in the sim, what is the price, is the
 * market clearing" without any of it competing with the page.
 */
export function SimStatus({ className }: { className?: string }) {
  const tick = useStore((s) => s.tick);
  const market = useStore((s) => s.market);

  if (!tick || !market) {
    return (
      <div className={cn('flex items-center gap-5', className)}>
        <div className="text-label font-semibold uppercase text-ink-3">Simulation</div>
        <div className="font-mono text-sm text-ink-3">connecting…</div>
      </div>
    );
  }

  const price = market.lastClearingPricePaise ?? market.indicativePricePaise;
  const cleared = market.lastClearingPricePaise != null;

  return (
    <div className={cn('flex items-center gap-x-5 gap-y-1', className)}>
      <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
        <span className="text-label font-semibold uppercase text-ink-3">Simulation</span>
        <time
          dateTime={tick.tsSim}
          className="font-mono text-md font-medium tabular-nums text-ink"
        >
          {simClock(tick.tsSim)}
        </time>
      </div>

      <Divider />

      <StatusItem label="Slot" value={slotLabel(market.slotId)} hint={`→ ${simClock(market.slotEndSim)}`} />

      <Divider />

      <StatusItem
        label={cleared ? 'Clearing' : 'Indicative'}
        value={rupees(price)}
        hint="/kWh"
        emphasis
      />

      <Divider className="hidden sm:block" />

      <StatusItem
        className="hidden sm:flex"
        label="Cloud"
        value={pct(tick.weather.cloudCoverPct, 0)}
      />

      <Divider className="hidden lg:block" />

      <StatusItem
        className="hidden lg:flex"
        label="Corridor"
        value={`${rupees(DEFAULT_TARIFF.feedInTariffPaise)}–${rupees(DEFAULT_TARIFF.retailTariffPaise)}`}
      />
    </div>
  );
}

function StatusItem({
  label,
  value,
  hint,
  emphasis,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 items-baseline gap-1.5 whitespace-nowrap', className)}>
      <span className="text-label font-semibold uppercase text-ink-3">{label}</span>
      <span
        className={cn(
          'font-mono text-sm tabular-nums',
          emphasis ? 'font-medium text-solar-deep' : 'text-ink',
        )}
      >
        {value}
      </span>
      {hint ? <span className="font-mono text-xs tabular-nums text-ink-3">{hint}</span> : null}
    </div>
  );
}

function Divider({ className }: { className?: string }) {
  return <span aria-hidden className={cn('h-3.5 w-px shrink-0 bg-rule/20', className)} />;
}

/** Progress through the current 15-minute slot, as a hairline under the header. */
export function SlotRibbon() {
  const simMinutes = useStore((s) => s.simMinutes);
  const progress = ((simMinutes % 15) / 15) * 100;
  return (
    <div className="h-px w-full bg-rule/[.13]" aria-hidden>
      <div
        className="h-px bg-solar transition-[width] duration-1000 ease-linear"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
