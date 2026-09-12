'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Underline tabs. They sit on the panel's own rule so the tab strip and the
 * panel edge are the same line rather than two stacked borders.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  label,
}: {
  tabs: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex items-stretch gap-0 overflow-x-auto no-scrollbar', className)}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors duration-120',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="ml-1.5 font-mono text-xs tabular-nums text-ink-3">{t.count}</span>
            ) : null}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-0 -bottom-px h-[2px]',
                active ? 'bg-solar' : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
