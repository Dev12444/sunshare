import { cn } from '@/lib/utils';

/**
 * Inline trend, sized to sit in a table cell or beside a metric. No axes, no
 * tooltip, no legend — if it needs those it is a chart and belongs in a panel.
 */
export function Sparkline({
  values,
  width = 68,
  height = 18,
  tone = 'solar',
  className,
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'solar' | 'up' | 'down' | 'muted';
  className?: string;
  ariaLabel?: string;
}) {
  if (values.length < 2) {
    return <span className={cn('inline-block', className)} style={{ width, height }} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 2) - 1}`);

  const stroke = {
    solar: 'rgb(var(--solar))',
    up: 'rgb(var(--up))',
    down: 'rgb(var(--down))',
    muted: 'rgb(var(--ink-3))',
  }[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block align-middle', className)}
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
