import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/domain';

const TONE: Record<Tone, string> = {
  neutral: 'border-rule/25 text-ink-2',
  up: 'border-up/40 text-up',
  down: 'border-down/45 text-down',
  warn: 'border-warn/45 text-warn',
  solar: 'border-solar/50 text-solar-deep',
  mains: 'border-mains/45 text-mains',
};

/**
 * Status is shown as a small rectangular tag, not a rounded pill.
 * Tags carry state only — never a decorative category, never a count.
 */
export function Tag({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] border px-1.5 py-[1px]',
        'text-micro font-semibold uppercase tracking-[0.07em] whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Utilisation / capacity bar. The only chart small enough to live in a cell. */
export function MeterBar({
  value,
  tone = 'neutral',
  className,
  ariaLabel,
}: {
  /** 0..1 */
  value: number;
  tone?: Tone;
  className?: string;
  ariaLabel?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill: Record<Tone, string> = {
    neutral: 'bg-ink-3',
    up: 'bg-up',
    down: 'bg-down',
    warn: 'bg-warn',
    solar: 'bg-solar',
    mains: 'bg-mains',
  };
  return (
    <span
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn('block h-1 w-full overflow-hidden rounded-[1px] bg-sunken', className)}
    >
      <span
        className={cn('block h-full transition-[width] duration-180', fill[tone])}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
