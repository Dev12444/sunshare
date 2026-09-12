/**
 * Lifecycle rail — Diya. The one recurring visual signature (see spec §4):
 * GENERATE → SURPLUS → MARKET → MATCH → SETTLE → IMPACT. Used wherever a
 * user needs to place a single energy unit or trade in its lifecycle —
 * never purely decorative.
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

  return (
    <ol className={cn('flex items-center text-[10px] font-medium uppercase tracking-wide', className)}>
      {LIFECYCLE_STAGES.map((stage, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={stage} className="flex items-center">
            <span
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5',
                active && 'bg-sun-500/15 text-sun-600 dark:text-sun-400',
                done && 'text-leaf-600 dark:text-leaf-400',
                !active && !done && 'text-grid-400',
              )}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  active && 'bg-sun-500',
                  done && 'bg-leaf-600 dark:bg-leaf-400',
                  !active && !done && 'bg-grid-400/50',
                )}
                aria-hidden
              />
              {stage}
            </span>
            {i < LIFECYCLE_STAGES.length - 1 && (
              <span className="mx-0.5 h-px w-3 bg-grid-400/30" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
