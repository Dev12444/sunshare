'use client';

import type { ReactNode } from 'react';

/**
 * One tooltip for every chart. Bordered, square, mono values — the same object
 * as a table row rather than a floating rounded bubble.
 */
export function ChartTooltip({
  title,
  rows,
  footer,
}: {
  title: ReactNode;
  rows: { label: string; value: string; color?: string }[];
  footer?: ReactNode;
}) {
  return (
    <div className="panel min-w-[152px] px-2.5 py-2 text-xs">
      <div className="font-mono text-xs font-medium tabular-nums text-ink">{title}</div>
      <dl className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-ink-3">
              {r.color ? (
                <span
                  aria-hidden
                  className="h-[2px] w-2.5"
                  style={{ background: r.color }}
                />
              ) : null}
              {r.label}
            </dt>
            <dd className="font-mono tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      {footer ? <div className="mt-1.5 border-t border-rule/[.13] pt-1.5 text-ink-3">{footer}</div> : null}
    </div>
  );
}

/** Legend that reads as a caption, not as a control. */
export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3 ${className ?? ''}`}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-[2px] w-4"
            style={
              i.dashed
                ? { backgroundImage: `repeating-linear-gradient(90deg, ${i.color} 0 3px, transparent 3px 6px)` }
                : { background: i.color }
            }
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
