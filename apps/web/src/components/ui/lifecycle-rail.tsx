/**
 * Lifecycle rail — Diya.
 *
 * The one recurring visual signature (spec §4): every unit of energy travels
 * GENERATE -> SURPLUS -> MARKET -> MATCH -> SETTLE -> IMPACT, and each screen
 * owns one leg of it. Placing the current screen on that path is what stops
 * the product reading as six unrelated dashboards.
 *
 * Only ever rendered with a real stage — it is a position indicator, not an
 * ornament. Rendered by PageHead on its own row beneath the title.
 */
import { cn } from '@/lib/utils';

export const LIFECYCLE_STAGES = [
  'GENERATE',
  'SURPLUS',
  'MARKET',
  'MATCH',
  'SETTLE',
  'IMPACT',
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export function LifecycleRail({
  current,
  className,
}: {
  current: LifecycleStage;
  className?: string;
}) {
  const currentIdx = LIFECYCLE_STAGES.indexOf(current);
  const label = `Lifecycle stage ${currentIdx + 1} of ${LIFECYCLE_STAGES.length}: ${current}`;

  return (
    <>
      {/* Under 640px six labelled stages do not fit beside a page title, so
          the rail keeps the ticks and names only where you are. Hiding it
          outright would drop the signature on the phone, which is the surface
          this product is primarily used on. */}
      <ol
        className={cn('flex items-center gap-1 font-mono text-[10px] sm:hidden', className)}
        aria-label={label}
      >
        {LIFECYCLE_STAGES.map((stage, i) => (
          <li key={stage} aria-hidden>
            <span
              className={cn(
                'block h-1.5 w-1.5 rounded-full',
                i === currentIdx && 'bg-solar',
                i < currentIdx && 'bg-up',
                i > currentIdx && 'bg-ink-3/40',
              )}
            />
          </li>
        ))}
        <li className="ml-1 font-medium tracking-[0.07em] text-solar-deep" aria-hidden>
          {current}
        </li>
      </ol>

      <ol
        className={cn('hidden items-center font-mono text-[10px] sm:flex', className)}
        aria-label={label}
      >
        {LIFECYCLE_STAGES.map((stage, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <li key={stage} className="flex items-center" aria-hidden>
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 tracking-[0.07em]',
                  active && 'bg-solar-wash font-medium text-solar-deep',
                  done && 'text-up',
                  !active && !done && 'text-ink-3',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    active && 'bg-solar',
                    done && 'bg-up',
                    !active && !done && 'bg-ink-3/40',
                  )}
                />
                {stage}
              </span>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <span className="mx-0.5 h-px w-3 bg-rule/40" />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
