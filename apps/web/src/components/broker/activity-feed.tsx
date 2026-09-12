'use client';

import { simClock } from '@/lib/format';
import { useStore, type ActivityEntry } from '@/lib/store';
import { cn } from '@/lib/utils';

const CHANNEL_RULE: Record<ActivityEntry['channel'], string> = {
  policy: 'border-l-solar',
  market: 'border-l-ink-3',
  broker: 'border-l-solar',
  match: 'border-l-up',
  settlement: 'border-l-up',
  community: 'border-l-mains',
  system: 'border-l-warn',
};

const CHANNEL_LABEL: Record<ActivityEntry['channel'], string> = {
  policy: 'policy',
  market: 'market',
  broker: 'broker',
  match: 'match',
  settlement: 'settle',
  community: 'pool',
  system: 'system',
};

/**
 * Agent activity.
 *
 * A chronological operational log in the register a control room actually
 * uses: timestamp, channel, one clause. No prose, no first person, nothing
 * that implies the software is narrating its own thoughts.
 */
export function ActivityFeed({
  limit = 40,
  channels,
  maxHeight = 340,
  emptyNote,
}: {
  limit?: number;
  channels?: ActivityEntry['channel'][];
  maxHeight?: number;
  emptyNote?: string;
}) {
  const activity = useStore((s) => s.activity);
  const rows = (channels ? activity.filter((a) => channels.includes(a.channel)) : activity).slice(
    0,
    limit,
  );

  if (rows.length === 0) {
    return (
      <p className="px-3.5 py-6 text-sm text-ink-3">
        {emptyNote ??
          'Nothing logged yet. Policy changes, market movements, matches and settlements appear here as they happen.'}
      </p>
    );
  }

  return (
    <ol className="overflow-y-auto" style={{ maxHeight }}>
      {rows.map((entry) => (
        <li
          key={entry.id}
          className={cn(
            'flex gap-2.5 border-b border-l-2 border-b-rule/[.09] px-3 py-1.5 last:border-b-0',
            CHANNEL_RULE[entry.channel],
          )}
        >
          <time className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
            {simClock(entry.tsSim)}
          </time>
          <span className="w-12 shrink-0 text-micro uppercase tracking-[0.07em] text-ink-3">
            {CHANNEL_LABEL[entry.channel]}
          </span>
          <span className="min-w-0 text-xs leading-[18px] text-ink-2">{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}
