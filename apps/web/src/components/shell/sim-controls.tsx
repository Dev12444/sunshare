'use client';

import { jumpTo, resetSimulation } from '@/lib/transport';
import { setState, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { IconPause, IconPlay, IconReset } from './icons';

const JUMPS: { label: string; minutes: number; title: string }[] = [
  { label: '08:00', minutes: 8 * 60, title: 'Morning — generation climbing, household peak fading' },
  { label: '12:34', minutes: 12 * 60 + 34, title: 'Noon — peak surplus against school and shop demand' },
  { label: '17:20', minutes: 17 * 60 + 20, title: 'Evening — surplus ending, demand and congestion rising' },
];

const SPEEDS = [1, 4, 12];

/**
 * Demo transport controls.
 *
 * Deliberately quiet: they belong to the person driving the demo, not to the
 * product. They sit at the foot of the rail at the same weight as a footnote.
 */
/**
 * `tone` exists because this control lives in two different surfaces: the
 * mobile sheet on paper, and the navigation rail, which is deep green in both
 * themes. Ink tokens invert with the theme and would be invisible on the rail,
 * so the dark tone uses the rail's own palette instead.
 */
export function SimControls({
  className,
  layout = 'stack',
  tone = 'light',
}: {
  className?: string;
  layout?: 'stack' | 'row';
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const mocked = useStore((s) => s.mocked);

  if (!mocked) return null;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center justify-between">
        <span className={cn('text-label font-semibold uppercase', dark ? 'text-forest-ink-2/75' : 'text-ink-3')}>
          Demo clock
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton dark={dark}
            label={playing ? 'Pause simulation' : 'Play simulation'}
            onClick={() => setState({ playing: !playing })}
          >
            {playing ? <IconPause size={12} /> : <IconPlay size={12} />}
          </IconButton>
          <IconButton dark={dark} label="Reset simulation" onClick={resetSimulation}>
            <IconReset size={12} />
          </IconButton>
        </div>
      </div>

      <div className={cn('mt-1.5 flex gap-1', layout === 'stack' ? 'flex-wrap' : '')}>
        {JUMPS.map((j) => (
          <button
            key={j.label}
            type="button"
            title={j.title}
            onClick={() => jumpTo(j.minutes)}
            className={cn(
              'rounded-sm border px-1.5 py-0.5 font-mono text-xs tabular-nums',
              dark
                ? 'border-white/15 text-forest-ink-2 hover:bg-forest-2 hover:text-forest-ink'
                : 'border-rule/20 text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {j.label}
          </button>
        ))}
        <span aria-hidden className={cn('mx-0.5 w-px self-stretch', dark ? 'bg-white/15' : 'bg-rule/15')} />
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            title={`${s} simulated minute${s > 1 ? 's' : ''} per second`}
            onClick={() => setState({ speed: s })}
            className={cn(
              'rounded-sm border px-1.5 py-0.5 font-mono text-xs tabular-nums',
              speed === s
                ? dark
                  ? 'border-solar bg-solar text-forest'
                  : 'border-ink bg-ink text-paper'
                : dark
                  ? 'border-white/15 text-forest-ink-2 hover:bg-forest-2 hover:text-forest-ink'
                  : 'border-rule/20 text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  dark,
  children,
}: {
  label: string;
  onClick: () => void;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-sm',
        dark
          ? 'text-forest-ink-2 hover:bg-forest-2 hover:text-forest-ink'
          : 'text-ink-2 hover:bg-sunken hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
