'use client';

/**
 * Energy lifecycle band — the product's recurring signature, with figures.
 *
 * The rail in ui/lifecycle-rail marks *where you are*; this band answers the
 * different question of *what each stage is worth right now*, which is what
 * the reference puts under the hero. Both exist because a stage label with no
 * number is a diagram, and a number with no stage is a statistic.
 *
 * Every value is passed in from live state. A stage with nothing behind it
 * yet shows an em dash rather than a zero — "0 kWh matched" and "no match yet"
 * mean different things to someone deciding whether to list.
 */
import { LIFECYCLE_STAGES, type LifecycleStage } from './lifecycle-rail';
import { cn } from '@/lib/utils';

export interface StageValue {
  /** The figure itself, already formatted. Null renders an em dash. */
  value: string | null;
  /** Unit or qualifier, shown smaller beside the value. */
  unit?: string;
}

export function LifecycleBand({
  current,
  values,
  className,
}: {
  current: LifecycleStage;
  values: Partial<Record<LifecycleStage, StageValue>>;
  className?: string;
}) {
  const currentIdx = LIFECYCLE_STAGES.indexOf(current);

  return (
    <ol
      className={cn(
        'grid grid-cols-2 divide-y divide-rule/[.10] sm:grid-cols-3 sm:divide-y-0',
        'lg:grid-cols-6 lg:divide-x lg:divide-rule/[.10]',
        className,
      )}
      aria-label={`Energy lifecycle, currently at ${current}`}
    >
      {LIFECYCLE_STAGES.map((stage, i) => {
        const v = values[stage];
        const done = i < currentIdx;
        const active = i === currentIdx;

        return (
          <li
            key={stage}
            aria-current={active ? 'step' : undefined}
            className={cn('px-4 py-3', active && 'bg-solar-wash/40')}
          >
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  active ? 'bg-solar' : done ? 'bg-up' : 'bg-rule/30',
                )}
              />
              <span
                className={cn(
                  'text-label font-semibold uppercase tracking-[0.08em]',
                  active ? 'text-solar-deep' : done ? 'text-up' : 'text-ink-3',
                )}
              >
                {stage}
              </span>
            </div>
            <div className="mt-1 font-mono text-base tabular-nums text-ink">
              {v?.value ?? <span className="text-ink-3">—</span>}
              {v?.value && v.unit ? (
                <span className="ml-1 text-xs text-ink-2">{v.unit}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
