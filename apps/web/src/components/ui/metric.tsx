'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'up' | 'down' | 'solar' | 'mains' | 'warn';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  up: 'text-up',
  down: 'text-down',
  solar: 'text-solar-deep',
  mains: 'text-mains',
  warn: 'text-warn',
};

/**
 * A metric is a label, a number and its unit — in that order of permanence and
 * the reverse order of visual weight. The unit is never the same size as the
 * value; a column of "4.21 kW" where kW is as loud as 4.21 is unreadable at a
 * glance, which is the only thing a metric is for.
 */
export function Metric({
  label,
  value,
  unit,
  tone = 'neutral',
  hint,
  size = 'md',
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  hint?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Briefly tint the value when it moves. Use for live market numbers only. */
  className?: string;
}) {
  const sizes = {
    sm: 'text-md',
    md: 'text-xl',
    lg: 'text-2xl',
  } as const;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-label font-semibold uppercase text-ink-3">{label}</div>
      <div
        className={cn(
          'mt-1 flex items-baseline gap-1 font-mono tabular-nums',
          sizes[size],
          TONE_TEXT[tone],
        )}
      >
        <span className="truncate font-medium">{value}</span>
        {unit ? (
          <span className="shrink-0 font-sans text-xs font-medium text-ink-3">{unit}</span>
        ) : null}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-ink-3">{hint}</div> : null}
    </div>
  );
}

/** A row of metrics separated by hairlines rather than gaps and cards. */
export function MetricRow({
  children,
  className,
  columns,
}: {
  children: ReactNode;
  className?: string;
  columns?: string;
}) {
  return (
    <div
      className={cn('hair-x grid', className)}
      style={{ gridTemplateColumns: columns ?? `repeat(auto-fit, minmax(128px, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function MetricCell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-3.5 py-3', className)}>{children}</div>;
}

/** Tiny inline label/value pair for dense inspectors. */
export function DataRow({
  label,
  children,
  mono = true,
  tone = 'neutral',
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  tone?: Tone;
}) {
  return (
    <div className="data-row">
      <dt className="shrink-0 text-xs text-ink-3">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-right text-sm',
          mono && 'font-mono tabular-nums',
          TONE_TEXT[tone],
        )}
      >
        {children}
      </dd>
    </div>
  );
}

