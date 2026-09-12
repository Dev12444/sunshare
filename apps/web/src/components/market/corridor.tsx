'use client';

import type { TariffContext } from '@sunshare/shared';
import { corridorPosition } from '@/lib/domain';
import { rupees } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The price corridor.
 *
 * This is the single idea the whole product rests on, so it gets one
 * recognisable visual object that appears everywhere a price does:
 *
 *     feed-in tariff  ≤  clearing price  ≤  retail tariff
 *
 * Below the floor the seller would rather export to the DISCOM. Above the
 * ceiling the buyer would rather import from it. Between them, both sides are
 * better off than not trading — and the wheeling charge, carved out of the
 * seller's side, is why the utility is a partner in that rather than a party
 * being routed around.
 */
export function PriceCorridor({
  tariff,
  clearingPricePaise,
  indicativePricePaise,
  askPricePaise,
  className,
  showLegend = true,
  height = 'md',
}: {
  tariff: TariffContext;
  clearingPricePaise: number | null;
  indicativePricePaise?: number | null;
  /** An order being composed, previewed against the corridor. */
  askPricePaise?: number | null;
  className?: string;
  showLegend?: boolean;
  height?: 'sm' | 'md';
}) {
  const toPct = (p: number) => corridorPosition(p, tariff) * 100;
  const wheelingPct = (tariff.wheelingChargePaise / (tariff.retailTariffPaise - tariff.feedInTariffPaise)) * 100;

  const bar = height === 'sm' ? 'h-6' : 'h-9';

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between text-micro font-semibold uppercase tracking-[0.07em] text-ink-3">
        <span>Floor · feed-in {rupees(tariff.feedInTariffPaise)}</span>
        <span>Ceiling · retail {rupees(tariff.retailTariffPaise)}</span>
      </div>

      <div
        className={cn('relative mt-1.5 w-full border border-rule/25 bg-sunken', bar)}
        role="img"
        aria-label={
          clearingPricePaise != null
            ? `Clearing price ${rupees(clearingPricePaise)} per kilowatt hour, inside a corridor from ${rupees(tariff.feedInTariffPaise)} to ${rupees(tariff.retailTariffPaise)}.`
            : `Price corridor from ${rupees(tariff.feedInTariffPaise)} to ${rupees(tariff.retailTariffPaise)} per kilowatt hour.`
        }
      >
        {/* The band the DISCOM keeps on every traded unit. */}
        <div
          className="absolute inset-y-0 left-0 border-r border-rule/20 bg-mains-wash/70"
          style={{ width: `${wheelingPct}%` }}
          title={`Wheeling charge ${rupees(tariff.wheelingChargePaise)}/kWh`}
        />

        {/* Quarter ticks, so the eye can read a position without a number. */}
        {[25, 50, 75].map((t) => (
          <div
            key={t}
            aria-hidden
            className="absolute inset-y-0 w-px bg-rule/[.16]"
            style={{ left: `${t}%` }}
          />
        ))}

        {indicativePricePaise != null ? (
          <Marker
            pct={toPct(indicativePricePaise)}
            variant="hollow"
            label={`Indicative ${rupees(indicativePricePaise)}`}
          />
        ) : null}

        {askPricePaise != null ? (
          <Marker pct={toPct(askPricePaise)} variant="draft" label={`Your price ${rupees(askPricePaise)}`} />
        ) : null}

        {clearingPricePaise != null ? (
          <Marker pct={toPct(clearingPricePaise)} variant="solid" label={`Clearing ${rupees(clearingPricePaise)}`} />
        ) : null}

        {clearingPricePaise != null ? (
          <div
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 font-mono text-xs font-medium tabular-nums text-ink"
            style={{
              left: `${toPct(clearingPricePaise)}%`,
              transform: `translate(${toPct(clearingPricePaise) > 62 ? '-100%' : '0'}, -50%)`,
            }}
          >
            {rupees(clearingPricePaise)}
          </div>
        ) : null}
      </div>

      {showLegend ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
          <LegendKey className="bg-mains-wash border-mains/40">
            Wheeling {rupees(tariff.wheelingChargePaise)}
          </LegendKey>
          {clearingPricePaise != null ? (
            <>
              <span>
                Seller nets{' '}
                <span className="font-mono tabular-nums text-up">
                  {rupees(clearingPricePaise - tariff.wheelingChargePaise)}
                </span>
              </span>
              <span>
                Buyer saves{' '}
                <span className="font-mono tabular-nums text-up">
                  {rupees(tariff.retailTariffPaise - clearingPricePaise)}
                </span>
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Marker({
  pct,
  variant,
  label,
}: {
  pct: number;
  variant: 'solid' | 'hollow' | 'draft';
  label: string;
}) {
  return (
    <div
      className="absolute inset-y-0 z-10 w-px"
      style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
      title={label}
    >
      <div
        className={cn(
          'h-full w-px transition-[left] duration-180',
          variant === 'solid' && 'bg-solar',
          variant === 'hollow' && 'bg-ink-3',
          variant === 'draft' && 'bg-ink',
        )}
        style={variant === 'hollow' ? { backgroundImage: 'none' } : undefined}
      />
      <span
        aria-hidden
        className={cn(
          'absolute -top-[3px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45',
          variant === 'solid' && 'bg-solar',
          variant === 'hollow' && 'border border-ink-3 bg-surface',
          variant === 'draft' && 'bg-ink',
        )}
      />
    </div>
  );
}

function LegendKey({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block h-2.5 w-4 border', className)} />
      {children}
    </span>
  );
}

/**
 * One-line corridor readout for headers and inspectors, where the full bar
 * would be more chart than the context deserves.
 */
export function CorridorInline({
  tariff,
  pricePaise,
  className,
}: {
  tariff: TariffContext;
  pricePaise: number;
  className?: string;
}) {
  const pct = corridorPosition(pricePaise, tariff) * 100;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="font-mono text-xs tabular-nums text-ink-3">
        {rupees(tariff.feedInTariffPaise)}
      </span>
      <span className="relative inline-block h-1.5 w-16 bg-sunken">
        <span
          className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-solar"
          style={{ left: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-xs tabular-nums text-ink-3">
        {rupees(tariff.retailTariffPaise)}
      </span>
    </span>
  );
}
